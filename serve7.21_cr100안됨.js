import dotenv from 'dotenv';
dotenv.config();
import { Buffer } from 'buffer';
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
import https from 'https';

import admin from 'firebase-admin';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// ⭐️ [해결 1] User 모델은 단 한번만 가져오도록 정리했습니다. (User.js 파일 export 방식에 맞춰 사용)
import{ User } from './models/User.js'; 

import { PortOneClient } from '@portone/server-sdk';
import { authMiddleware } from './middlewares/auth.js';

const router = express.Router();

// ES Module 환경 설정 (__dirname 선언)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

// FFmpeg 경로 지정
ffmpeg.setFfmpegPath(ffmpegInstaller);

// Express 서버 초기화
const app = express();
const PORT = process.env.PORT || 10000; 

// 글로벌 네트워크 미들웨어 세팅
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// EJS 템플릿 엔진 설정
app.set('view engine', 'ejs');
app.set('views', './views');

// API 키 및 서비스 연결 설정
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const SUNO_API_KEY = process.env.VITE_SUNO_API_KEY;
const portoneClient = new PortOneClient({
  secret: process.env.PORTONE_API_SECRET 
});

app.post('/api/auth/kakao', async (req, res) => {
  const { code } = req.body;

  try {
    const response = await axios.post('https://kauth.kakao.com/oauth/token', null, {
      params: {
        grant_type: 'authorization_code',
        client_id: process.env.KAKAO_REST_API_KEY,
        redirect_uri: process.env.KAKAO_REDIRECT_URI,
        code: code,
        client_secret: process.env.KAKAO_CLIENT_SECRET
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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
// 🍃 [MongoDB 연결 설정]
// =================================================================
const MONGODB_URI = process.env.VITE_MONGODB_URI;
mongoose.connect(MONGODB_URI, { dbName: 'sample_mflix' })
  .then(() => console.log("🍃 MongoDB 'sample_mflix' 데이터베이스 연결 성공!"))
  .catch(err => console.error("❌ MongoDB 연결 실패:", err));

// 트래픽 디펜더 설정
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});

// =================================================================
// 🏠 [라우터] 사용자가 메인 페이지(/)에 접속했을 때
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

// ⭐️ [해결 2] firebase-login 내부의 user 선언 재정리
router.post('/api/auth/firebase-login', async (req, res) => {
  const { idToken } = req.body;

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    // decodedToken에서 기본 프로필 정보 추출
    const { uid, email, nickname , credits , updatedAt } = decodedToken;

    // MongoDB의 users 컬렉션에서 firebaseUid로 기존 유저 검색
    let existingUser = await User.findOne({ firebaseUid: uid });

    if (existingUser) {
      console.log('기존 회원 로그인 성공:', existingUser.email || existingUser.name);

      // ⭐️ 핵심: 만약 기존 유저의 credits 값이 없거나 undefined인 경우 0으로 보정
      const userObj = existingUser.toObject();
      if (userObj.credits === undefined || userObj.credits === null) {
        userObj.credits = 0;
      }

      return res.status(200).json({
        isNewUser: false,
        message: '로그인 성공',
        user: userObj
      });
    } else {
      console.log('신규 회원 등록 진행 중...');
      
      // 소셜 로그인 특성상 email이나 name이 없는 경우 대비 기본값 설정
      const userEmail = email || `${uid.substring(0, 8)}@kakao.user`;
      const userName = name || '사용자';

      const newUser = new User({
        firebaseUid: uid,
        email: userEmail,
        name: userName,
        profileImage: picture || '',
        credits: 2, // ⭐️ 가입 보상 2포인트 세팅
        createdAt: new Date()
      });

      await newUser.save();

      return res.status(201).json({
        isNewUser: true,
        message: '회원가입 성공',
        user: newUser
      });
    }

  } catch (error) {
    console.error('인증 및 DB 비교 오류:', error);
    return res.status(401).json({ error: '유효하지 않은 토큰이거나 인증 실패했습니다.' });
  }
});

app.use('/', router);

// 💡 이메일 찾기 API 엔드포인트
app.post('/api/find-email', async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ success: false, error: "전화번호를 입력해 주세요." });
  }

  try {
    const userDoc = await User.findOne({ phoneNumber: phoneNumber });
    
    if (!userDoc) {
      return res.status(404).json({ success: false, error: "일치하는 회원 정보가 없습니다." });
    }

    const email = userDoc.email;
    const [localPart, domain] = email.split('@');
    const maskedLocal = localPart.substring(0, 3) + '*'.repeat(Math.max(0, localPart.length - 3));
    const maskedEmail = `${maskedLocal}@${domain}`;

    res.json({ 
      success: true, 
      maskedEmail: maskedEmail 
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 🔍 [API] 이메일을 기준으로 MongoDB 유저 조회
// ==========================================
app.get('/api/user/email/:email', async (req, res) => {
  try {
    const userEmail = req.params.email;

    if (!userEmail) {
      return res.status(400).json({ success: false, message: "이메일 파라미터가 누락되었습니다." });
    }

    const foundUser = await User.findOne({ email: userEmail.trim() });

    if (foundUser) {
      // ⭐️ [해결 3] users -> foundUser 변수명 일치
      return res.json({ success: true, user: foundUser });
    } else {
      return res.status(404).json({ success: false, message: "MongoDB에 등록되지 않은 유저입니다." });
    }
  } catch (error) {
    console.error("❌ MongoDB 유저 조회 오류:", error);
    return res.status(500).json({ success: false, message: "서버 내부 오류 발생" });
  }
});

// 크레딧 잔액 조회
app.get('/api/user/profile', authMiddleware, (req, res) => {
  return res.status(200).json({
    success: true,
    // ⭐️ [해결 4] req.users -> req.user 변수 오타 수정
    credits: req.users ? req.users.credits : 0 
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
// 🎬 [API] 앨범 재킷 이미지 + MP3 비디오 병합 엔드포인트
// ==========================================
app.post('/api/generate-video', async (req, res) => {
  const { audioUrl, jacketImage } = req.body;

  if (!audioUrl || !jacketImage) {
    return res.status(400).json({ success: false, error: "데이터가 부족합니다." });
  }

  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const inputImagePath = path.join(tempDir, `input_${Date.now()}.png`);
  const inputAudioPath = path.join(tempDir, `input_${Date.now()}.mp3`);
  const outputVideoPath = path.join(tempDir, `output_${Date.now()}.mp4`);

  const downloadAudio = (url, dest) => {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      https.get(url, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    });
  };

  try {
    const base64Data = jacketImage.replace(/^data:image\/\w+;base64,/, "");
    fs.writeFileSync(inputImagePath, Buffer.from(base64Data, 'base64'));

    await downloadAudio(audioUrl, inputAudioPath);

    ffmpeg()
      .input(inputImagePath)
      .loop()
      .input(inputAudioPath)
      .outputOptions([
        '-c:v libx264',
        '-tune stillimage',
        '-c:a aac',
        '-b:a 192k',
        '-pix_fmt yuv420p',
        '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-shortest'
      ])
      .output(outputVideoPath)
      .on('end', () => {
        console.log('🎬 MP4 비디오 합성 성공!');
        
        res.download(outputVideoPath, 'birthday-video.mp4', (err) => {
          if (fs.existsSync(inputImagePath)) fs.unlinkSync(inputImagePath);
          if (fs.existsSync(inputAudioPath)) fs.unlinkSync(inputAudioPath);
          if (fs.existsSync(outputVideoPath)) fs.unlinkSync(outputVideoPath);
        });
      })
      .on('error', (err) => {
        console.error('❌ FFmpeg 실패:', err.message);
        if (fs.existsSync(inputImagePath)) fs.unlinkSync(inputImagePath);
        if (fs.existsSync(inputAudioPath)) fs.unlinkSync(inputAudioPath);
        res.status(500).json({ success: false, error: "동영상 변환 실패" });
      })
      .run();

  } catch (error) {
    console.error('❌ 예외 처리 진입:', error);
    if (fs.existsSync(inputImagePath)) fs.unlinkSync(inputImagePath);
    if (fs.existsSync(inputAudioPath)) fs.unlinkSync(inputAudioPath);
    res.status(500).json({ success: false, error: "동영상 변환 실패" });
  }
});

// ==========================================
// 🚀 [Vite SSR 통합 및 서버 스타트]
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