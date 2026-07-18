// 1. 가장 먼저 환경변수 장부를 로드하여 모든 비공개 키가 인식되도록 조치합니다.
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from 'ffmpeg-static';
import { rateLimit } from 'express-rate-limit';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 💡 Firebase Admin SDK 최신 ESM 표준 문법 가져오기
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// 💡 우리 프로젝트 안의 파일들 가져오기
import { User } from './models/User.js';
import { PortOneClient } from '@portone/server-sdk';
import { authMiddleware } from './middlewares/auth.js';
import { MongoClient, ServerApiVersion } from 'mongodb';
// 💡 ES Module 환경 설정 (__dirname 선언)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
// FFmpeg 경로 지정
ffmpeg.setFfmpegPath(ffmpegInstaller);

// Express 서버 초기화
const app = express();
const PORT = process.env.PORT || 3000; 

// 글로벌 네트워크 미들웨어 세팅
app.set('trust proxy', 1);
app.use(cors({
  origin: 'http://localhost:5173', 
  credentials: true 
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
import { userInfo } from 'os';
// EJS 템플릿 엔진 설정
app.set('view engine', 'ejs');
app.set('views', './views'); // views 폴더 안의 템플릿들을 바라봅니다.

// API 키 및 서비스 연결 설정
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const SUNO_API_KEY = process.env.VITE_SUNO_API_KEY;

// =================================================================
// 🍃 [MongoDB 연결 설정]
// =================================================================
// ⚠️ 중요: 주소 끝에 반드시 /sample_mflix 가 붙어있어야 이 데이터를 찾아옵니다!
// 예: mongodb+srv://...net/sample_mflix
const mongoURI = process.env.VITE_MONGODB_URI;

mongoose.connect(mongoURI)
  .then(() => console.log('✅ Mongoose를 통해 sample_mflix 연결 성공!'))
  .catch(err => console.error('❌ Mongoose 연결 실패:', err));
  // 트래픽 디펜더 설정
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});

// =================================================================
// 🍃 [MongoDB 스키마 & 모델 설정]
// =================================================================
const userSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  nickname: { type: String, required: true },
  credits: { type: Number, default: 3 },
  updatedAt: { type: Date, default: Date.now }
}, { 
  collection: 'users'
});

const MongooseUser = mongoose.models.User || mongoose.model('User', userSchema); 

// 🍃 [MongoDB 연결 설정]
// =================================================================

// 회원의 ID를 받아 credits 정보를 포함한 회원 정보를 반환하는 API
app.get('/api/user/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    console.log(`🔍 조회 요청된 firebaseUid: ${uid}`);
    
    // 🔑 여기서도 MongooseUser를 사용합니다.
    const user = await MongooseUser.findOne({ firebaseUid: uid }); 
    
    if (!user) {
      console.log(`❌ 유저를 찾지 못함: ${uid}`);
      return res.status(404).json({ success: false, error: "유저를 찾을 수 없습니다." });
    }
    
    console.log(`✅ 유저 조회 성공! 크레딧: ${user.credits}`);
    
    return res.status(200).json({
      success: true,
      credits: user.credits, 
      nickname: user.nickname
    });
  } catch (error) {
    console.error("❌ 유저 프로필 조회 중 서버 에러:", error);
    return res.status(500).json({ success: false, error: "서버 내부 인증 처리 실패" });
  }
});
const port = process.env.PORT || 3000;
if (!mongoURI) {
  throw new Error('MONGODB_URI가 .env 파일에 설정되어 있지 않습니다.');
}
const client = new MongoClient(mongoURI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function startServer1() {
  await client.connect();
  console.log('MongoDB에 연결되었습니다.');
  const db = client.db('sample_mflix');
  const users = db.collection('users');
  // 클라이언트가 보낸 email, credits, nickname 저장
  app.post('/users', async (req, res) => {
  try {
    const { email, credits, nickname, firebaseUid } = req.body;
    const newUser = await User.create({
      firebaseUid,
      email,
      credits: Number(credits) || 3,
      nickname
    });
    return res.status(201).json({ message: '사용자 데이터가 저장되었습니다.', data: newUser });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

  app.listen(port, () => {
    console.log(`서버 실행 중: http://localhost:${port}`);
  });
}
startServer1().catch((err) => {
  console.error('서버 시작 실패:', err);
  process.exit(1);
});


// =================================================================
// 🔥 [Firebase Admin SDK 단일 안전 초기화]
// =================================================================
const firebaseConfigRaw = process.env.VITE_FIREBASE_SERVICE_ACCOUNT;
if (!firebaseConfigRaw) {
  console.error("❌ 환경변수에 FIREBASE_SERVICE_ACCOUNT가 설정되지 않았습니다!");
  process.exit(1);
}

if (getApps().length === 0) {
  try {
    const serviceAccount = JSON.parse(firebaseConfigRaw);
    initializeApp({
      credential: cert(serviceAccount)
    });
    console.log("🚀 Firebase Admin SDK 단일 초기화 완벽 성공!");
  } catch (error) {
    console.error("❌ Firebase 초기화 중 JSON 파싱 에러 발생:", error.message);
    process.exit(1);
  }
}
// =================================================================
// 🏠 [라우터] 사용자가 메인 페이지(/)에 접속했을 때 화면을 그려주는 템플릿 엔진
// =================================================================
app.get('/', (req, res) => {
  const firebaseKeys = {
    apiKey: process.env.FIREBASE_PUBLIC_API_KEY,
    authDomain: process.env.FIREBASE_PUBLIC_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PUBLIC_PROJECT_ID,
    storageBucket: process.env.FIREBASE_PUBLIC_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_PUBLIC_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_PUBLIC_APP_ID
  };
  res.render('index', { firebaseKeys });
});

// =================================================================
// 🔑 [API] 회원가입 및 로그인 처리 문지기
// =================================================================
app.post('/api/login', authMiddleware, async (req, res) => {
  try {
    // 1. 미들웨어에서 해석한 firebaseUser 정보 가져오기
    const firebaseUser = req.user; 
    
    // 2. 예외 처리
    if (!firebaseUser) {
        return res.status(401).json({
            success: false,
            error: "인증된 유저 정보가 존재하지 않습니다."
        });
    }

    // 3. (필수 확인) 만약 MongoDB의 정보를 반환해야 한다면 DB 조회가 필요합니다.
    // authMiddleware가 req.user에 MongoDB에서 찾은 유저 객체 정보를 넣어둔 상태라면 그대로 사용하고,
    // 만약 파이어베이스 정보만 들어있다면 아래처럼 DB를 한 번 조회해야 합니다.
    let dbUser = await User.findOne({ firebaseUid: firebaseUser.uid });

    // 만약 디비에 유저가 없다면 (첫 로그인 등) 임시로 생성하거나 에러 처리
    if (!dbUser) {
      dbUser = await User.create({
        firebaseUid: firebaseUser.uid,
        email: firebaseUser.email || `${firebaseUser.uid}@app.com`,
        nickname: firebaseUser.name || "보호자",
        credits: 5
      });
    }

    // 4. 안전하게 정의된 dbUser(혹은 firebaseUser) 변수를 사용하여 응답 전송
    return res.status(200).json({
      success: true,
      message: `${dbUser.email}님, 환영합니다!`,
      data: {
        uid: dbUser.firebaseUid,
        email: dbUser.email,
        nickname: dbUser.nickname,
        credits: dbUser.credits 
      }
    });

  } catch (error) {
    console.error("🔒 백엔드 로그인 라우터 에러:", error);
    return res.status(500).json({
      success: false,
      error: "서버 내부 인증 처리 실패"
    });
  }
});

// ==========================================
// 🍑 [API] 카카오 로그인 및 커스텀 토큰 발급소
// ==========================================
app.post('/api/auth/kakao', async (req, res) => {
  const { code } = req.body; // 프론트엔드가 보내준 인증 코드

  if (!code) {
    return res.status(400).json({ success: false, error: "인증 코드가 없습니다." });
  }

  try {
    // 1. 인가 코드를 카카오 토큰으로 교환
    const tokenResponse = await axios.post(
      'https://kauth.kakao.com/oauth/token',
      null,
      {
        params: {
          grant_type: 'authorization_code',
          client_id: process.env.KAKAO_REST_API_KEY,
          redirect_uri: process.env.KAKAO_REDIRECT_URI,
          code: code,
        },
        headers: {
          'Content-type': 'application/x-www-form-urlencoded;charset=utf-8'
        }
      }
    );

    const { access_token } = tokenResponse.data;

    // 2. 액세스 토큰으로 카카오 사용자 정보 가져오기
    const userResponse = await axios.get('https://kapi.kakao.com/v2/user/me', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-type': 'application/x-www-form-urlencoded;charset=utf-8'
      }
    });

    const kakaoUser = userResponse.data;
    const kakaoUid = `kakao:${kakaoUser.id}`; // 파이어베이스용 고유 UID 조각
    const email = kakaoUser.kakao_account?.email || `${kakaoUser.id}@kakao.com`;
    const nickname = kakaoUser.properties?.nickname || "카카오 보호자";

    // 3. Firebase Admin SDK를 이용해 이 사용자를 위한 커스텀 토큰 생성
    const customToken = await getAuth().createCustomToken(kakaoUid, {
      email: email,
      nickname: nickname
    });

    // 4. 먼저 MongoDB에 유저 데이터가 있는지 검사하고 없으면 생성
    let dbUser = await User.findOne({ firebaseUid: kakaoUid });
    if (!dbUser) {
      dbUser = await User.create({
        firebaseUid: kakaoUid,
        email: email,
        nickname: nickname,
        credits: 5 // 신규 가입 웰컴 크레딧
      });
    }

    // 5. 프론트엔드로 커스텀 토큰 안전 배달
    return res.status(200).json({
      success: true,
      customToken,
      user: {
        email,
        nickname,
        credits: dbUser.credits
      }
    });

  } catch (error) {
    console.error("❌ 카카오 인증 처리 실패:", error.response?.data || error.message);
    return res.status(500).json({ success: false, error: "카카오 인증 처리 중 에러가 발생했습니다." });
  }
});

// 크레딧 잔액 조회
app.get('/api/user/profile', authMiddleware, (req, res) => {
  return res.status(200).json({
    success: true,
    credits: req.user.credits
  });
});


// =================================================================
// 🤖 [API] Gemini 한글 가사 자동 생성소 (gemini-2.5-flash-lite)
// =================================================================
app.post('/api/generate-lyrics', apiLimiter, async (req, res) => {
    try {
        if (!req.body) return res.status(400).json({ error: "요청 본문이 비어있습니다." });
        const { name, zodiac, stone, flower, fixedChorus, genre, isSunoAutoMode } = req.body;
        const fallbackName = name || '우리 아이';
        const defaultLyrics = `[Intro]\n기분 좋은 날 바로 오늘\n\n[Verse 1]\n우리 곁에 와준 귀여운 천사 ${fallbackName}\n너의 모든 몸짓이 너무나 사랑스러워\n오늘 너의 특별한 생일날\n온 세상을 다 담아서 축하해\n\n[Chorus]\n${fallbackName}야 생일 축하해\n영원히 영원히 사랑해\n함께 걷는 모든 날들이\n전부 다 축복일 거야`.trim();

        const safeChorus = fixedChorus || `${fallbackName}야 생일 축하해`;

        if (!GEMINI_API_KEY) return res.json({ lyrics: defaultLyrics });

        let prompt = '';
        if (isSunoAutoMode === true || isSunoAutoMode === 'suno') {
            prompt = `너는 반려동물을 위해 경쾌하고 사랑스러운 생일 축하 곡을 쓰는 최고의 AI 작사가야.
            음악 장르 [${genre}] 스타일에 어울리는 세련된 한글 가사로 작성해줘. 영어 단어는 절대 섞지 마라.
            [🔥 중요 제한 조건]
            Suno AI가 1분 내외로 완창할 수 있도록 가사를 절대 길게 쓰지 말고, 전체 분량을 최대 150자 이내로 아주 짧고 압축적으로 작성해줘.
            주인공 이름: ${name} (가사 전반에 최소 2~3번 정도만 자연스럽게 등장시킬 것)
            [반드시 아래의 딱 3가지 구조로만 제한해서 출력해]
            [Intro]
            (아주 짧은 도입부 한 줄)
            [Verse 1]
            (짧게 2줄에서 3줄 이내)
            [Chorus]
            ${safeChorus} (이 문장을 시작으로 축하하는 내용 2줄 이내)
            설명문이나 인사말은 절대 생략하고 오직 위 3가지 대괄호 태그들과 한글 가사 본문만 딱 출력해.`;
        } else {
            const randomCoin = Math.floor(Math.random() * 2);

            if (randomCoin === 0) {
                prompt = `너는 감동적이고 신나는 생일 축하 노래를 작사하는 최고의 AI 작사가야. 이름: ${name}, 탄생석: ${stone}, 탄생화: ${flower}. 설명이나 인사말은 절대 넣지 말고 가사 본문만 출력해라.`;
            } else {
                prompt = `너는 감동적이고 신나는 생일 축하 노래를 작사하는 최고의 AI 작사가야.
                반드시 아래의 가사 구조와 내용을 '최대한 그대로 유지'하면서, 음악 장르 ${genre} 스타일에 어울리는 세련된 한글 가사로 완성해줘.
                설명이나 인사말은 절대 넣지 말고, 대괄호 태그를 포함한 가사 본문만 딱 출력해라.
                [가사 필수 레이아웃 및 본문 지시]
                [Intro]
                ${name} 생일 축하해
                [Pre-Chorus]
                저 우주 너머 ${zodiac} 에서
                태어나 지구로 날아온 ${name}
                [Verse 1]
                ${stone} 깨고 태어난 사랑스런 ${name}
                ${flower} 향기 가득한 날에 태어난 당신 
                함께있는 우리 모두 모여
                온마음을 다해 축하 축하합니다
                [Chorus]
                ${stone} 깨고 태어난 사랑스런 ${name}
                ${flower} 향기 가득한 날에 태어난 당신
                [Verse 2]
                아름다운 그 이름 ${name}
                ${name}의 생일을 
                진심으로 축하 축하합니다.`;
            }
        }

        const ai = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = ai.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

        let generatedLyrics = "";
        try {
            const result = await model.generateContent(prompt);
            const aiResponse = await result.response;
            if (aiResponse && aiResponse.text) {
                generatedLyrics = aiResponse.text();
            } else {
                generatedLyrics = defaultLyrics;
            }
        } catch (aiError) {
            console.error("❌ Gemini SDK 가사 생성 요청 실패:", aiError);
            generatedLyrics = defaultLyrics;
        }

        return res.json({ lyrics: generatedLyrics || defaultLyrics });

    } catch (globalError) {
        console.error("🚨 서버 내부 에러 발생:", globalError);
        return res.status(500).json({ error: "서버 내부 오류로 가사를 생성할 수 없습니다." });
    }
});

// ==========================================
// 🎵 [API] Suno AI 음원 생성 결합 라우터
// ==========================================
async function universalFetch(url, options) {
    if (globalThis.fetch) {
        return globalThis.fetch(url, options);
    }
    const nodeFetch = await import('node-fetch');
    return nodeFetch.default(url, options);
}

app.post('/api/generate-song', async (req, res) => {
    const { prompt, genre, title, lyricMode, name } = req.body;

    try {
        if (!SUNO_API_KEY) {
            return res.status(400).json({ error: "Suno API Key가 설정되지 않았습니다." });
        }

        const isCustomMode = lyricMode !== 'suno';
        const requestBody = {
            prompt: prompt,
            customMode: isCustomMode,
            style: genre || 'pop',
            title: title || 'My Pet Birthday Song',
            instrumental: false,
            model: 'V4_5ALL',
            callBackUrl: 'https://birthday-backend-server-1.onrender.com/api/suno-callback'
        };

        const response = await universalFetch('https://api.sunoapi.org/api/v1/generate', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SUNO_API_KEY.trim()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        let data;
        try {
            data = await response.json();
        } catch (jsonErr) {
            return res.status(500).json({ error: "Suno 서버 에러 응답 발생" });
        }

        if (data.code === 200 && data.data && data.data.taskId) {
            return res.json({
                success: true,
                taskId: data.data.taskId
            });
        } else {
            console.error("❌ Suno 서버 요청 실패:", data.msg);
            return res.status(500).json({ error: data.msg || "Suno 노래 요청에 실패했습니다." });
        }
    } catch (error) {
        console.error("❌ 서버 내부 치명적 예외:", error);
        return res.status(500).json({ error: "음악 생성 서버 통신 오류" });
    }
});

// ==========================================
// 🔍 [API] Suno 생성 상태 모니터링 라우터
// ==========================================
app.get('/api/song-status/:taskId', async (req, res) => {
    const { taskId } = req.params;
    if (!SUNO_API_KEY) return res.status(500).json({ status: 'ERROR' });

    try {
        const sunoApiUrl = `https://api.sunoapi.org/api/v1/generate/record-info?taskId=${taskId}`;
        const response = await universalFetch(sunoApiUrl, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${SUNO_API_KEY.trim()}` }
        });

        if (!response.ok) return res.status(response.status).json({ status: 'ERROR' });

        let result = await response.json();
        const taskData = result.data;
        let currentStatus = 'PENDING';

        if (taskData?.status) {
           currentStatus = String(taskData.status).toUpperCase();
        } else if (Array.isArray(taskData) && taskData.length > 0 && taskData[0].status) {
            currentStatus = String(taskData[0].status).toUpperCase();
        }
       
        if (currentStatus === 'SUCCESS') {
            let audioUrl = null;
            let finalPrompt = null;
            let musicArray = [];

            if (Array.isArray(taskData.data)) musicArray = taskData.data;
            else if (Array.isArray(taskData)) musicArray = taskData;
            else if (taskData.response && Array.isArray(taskData.response.data)) musicArray = taskData.response.data;

            if (musicArray.length > 0) {
                const track = musicArray[0];
                audioUrl = track.audio_url || track.audioUrl || track.stream_audio_url || null;
                finalPrompt = track.prompt || track.lyric || null;
            }

            if (!audioUrl && taskData) {
                const str = JSON.stringify(taskData);
                const match = str.match(/(https?:\/\/[^\s"'<>]+\.(?:mp3|mp4|m4a))/i);
                if (match) audioUrl = match[1] || match[0];
            }

            if (audioUrl && (audioUrl.includes('render.com') || audioUrl.includes('callback'))) {
                audioUrl = null;
            }

            if (taskData) {
                const rawDataString = JSON.stringify(taskData);
                const promptMatch = rawDataString.match(/"prompt"\s*:\s*"([^"]+)"/);
                if (promptMatch && promptMatch[1] && !promptMatch[1].includes('celebrating the birthday')) {
                    finalPrompt = promptMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                }
            }

            if (audioUrl) {
                return res.json({
                    status: 'SUCCESS',
                    audioUrl: audioUrl,
                    prompt: finalPrompt,
                    lyric: finalPrompt
                });
            } else {
                return res.json({ status: 'PENDING' });
            }
        } else if (currentStatus === 'FAILED' || currentStatus === 'ERROR') {
            return res.json({ status: 'FAILED' });
        } else {
            return res.json({ status: 'PENDING' });
        }
    } catch (error) {
        return res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

// ==========================================
// 🎬 [API] 앨범 재킷 이미지 + MP3 비디오 병합(굽기) 엔드포인트
// ==========================================
app.use('/videos', express.static(path.join(__dirname, 'videos')));

app.post('/api/generate-video', async (req, res) => {
    try {
        const { audioUrl, jacketImage } = req.body;
        const videoDir = path.join(__dirname, 'videos');
        if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir);

        const uniqueId = Date.now();
        const imagePath = path.join(videoDir, `temp_${uniqueId}.jpg`);
        const audioPath = path.join(videoDir, `temp_${uniqueId}.mp3`);
        const videoPath = path.join(videoDir, `video_${uniqueId}.mp4`);

        const base64Data = jacketImage.replace(/^data:image\/\w+;base64,/, "");
        fs.writeFileSync(imagePath, base64Data, 'base64');

        const audioResponse = await universalFetch(audioUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*'
            }
        });
        if (!audioResponse.ok) throw new Error("오디오 다운로드 차단됨");

        const arrayBuffer = await audioResponse.arrayBuffer();
        fs.writeFileSync(audioPath, Buffer.from(arrayBuffer));

        ffmpeg()
            .input(imagePath)
            .inputOptions(['-loop 1'])
            .input(audioPath)
            .outputOptions([
                '-map 0:v:0',
                '-map 1:a:0',
                '-c:v libx264',
                '-tune stillimage',
                '-c:a aac',
                '-b:a 192k',
                '-pix_fmt yuv420p',
                '-shortest'
            ])
            .save(videoPath)
            .on('end', () => {
                res.json({
                    success: true,
                    videoUrl: `https://birthday-backend-server-1.onrender.com/videos/video_${uniqueId}.mp4`
                });
                try {
                    fs.unlinkSync(imagePath);
                    fs.unlinkSync(audioPath);
                } catch (e) { }
            })
            .on('error', (err) => {
                res.status(500).json({ success: false, error: "동영상 변환 실패" });
            });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 🚀 [Vite SSR 통합 및 서버 최종 스타트]
// ==========================================
async function startServer() {
  app.use('/*splat', async (req, res, next) => {
    const url = req.originalUrl;
    
    if (url.startsWith('/api') || url.startsWith('/videos')) {
      return next();
    }

    try {
      if (typeof ssrEnvironment !== 'undefined') {
        const result = await ssrEnvironment.transformRequest(url);
        if (result && result.code) {
          return res.status(200).set({ 'Content-Type': 'application/javascript' }).end(result.code);
        }
      }
      next();
    } catch (e) {
      console.error("에러:", e);
      res.status(500).end(e.message);
    }
  });

  app.listen(PORT, () => {
      console.log(`🚀 백엔드 서버가 ${PORT} 포트에서 구동을 시작했습니다.`);
  });
}

startServer().catch((err) => console.error("⚠️ Vite 개발 서버 초기화 실패:", err));