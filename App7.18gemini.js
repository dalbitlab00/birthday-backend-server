import React, { useState, useEffect, useRef } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCustomToken
} from 'firebase/auth';

// 🔑 Firebase Client SDK 설정값 및 카카오 클라이언트 설정
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCoaW7ZDVGqsTqNjMItuuC6Drmii9wylpo",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "stable-being-497702-i2.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "stable-being-497702-i2",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "stable-being-497702-i2.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "460437137026",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:460437137026:web:065fe858287e8ea0a9369b"
};

let firebaseApp;
let auth = null;

try {
  if (!firebaseConfig.apiKey) {
    console.warn("⚠️ [경고] .env 파일에서 Firebase 설정을 로드하지 못했습니다. 키값이 설정되어 있는지 확인해 주세요.");
  }
  firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  auth = getAuth(firebaseApp);
} catch (error) {
  console.error("❌ Firebase 초기화 중 치명적 오류 발생 (환경변수 매핑 오류 가능성):", error);
}

const KAKAO_CLIENT_ID = import.meta.env.VITE_KAKAO_CLIENT_ID || "453baee42c333c2da7260e13038fb556";
const KAKAO_REDIRECT_URI = "http://localhost:5173/oauth/kakao";
const KAKAO_AUTH_URL = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${KAKAO_CLIENT_ID}&redirect_uri=${KAKAO_REDIRECT_URI}&&prompt=select_account&scope=account_email,nickname,gender&lang=ko`;

const getBackendUrl = () => {
  if (typeof window === 'undefined') return '';
  return window.location.port === "5173" || window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "";
};

export default function App() {
  const BACKEND_URL = getBackendUrl();

  // --- 반려동물 정보 State ---
  const [petName, setPetName] = useState('');
  const [petBirthday, setPetBirthday] = useState('');
  const [petZodiac, setPetZodiac] = useState('자동 연동');
  const [petStone, setPetStone] = useState('자동 연동');
  const [petFlower, setPetFlower] = useState('자동 연동');
  const [musicGenre, setMusicGenre] = useState('pop');
  const [fixedChorus, setFixedChorus] = useState('');
  const [lyricMode, setLyricMode] = useState('custom');

  // --- 유저 정보 & 로딩 State ---
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('가사를 짓고 있습니다...');

  // --- 모달 제어 State ---
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  // --- 자켓스튜디오 관련 핵심 State ---
  const [isJacketStudioOpen, setIsJacketStudioOpen] = useState(false);
  const [jacketImage, setJacketImage] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState('user'); 
  const [stickers, setStickers] = useState([]); 
  const [selectedStickerId, setSelectedStickerId] = useState(null);
  const [frameStyle, setFrameStyle] = useState('none'); 
  const [imageFilters, setImageFilters] = useState({
    brightness: 100,
    contrast: 100,
    saturate: 100,
    grayscale: 0,
    blur: 0,
    sharpen: 0
  });

  // --- 마이룸 스트리밍 관련 핵심 State ---
  const [isMyRoomOpen, setIsMyRoomOpen] = useState(false);
  const [activeTrack, setActiveTrack] = useState(null); 
  const [isPlaying, setIsPlaying] = useState(false);

  // --- 재생 상태 관리용 State ---
  const [currentTime, setCurrentTime] = useState(0); 
  const [duration, setDuration] = useState(0);       

  const audioRef = useRef(null); 
  const kakaoAuthRun = useRef(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const jacketAreaRef = useRef(null);

  // 1. 초(seconds)를 00:00 포맷으로 변환해주는 함수
  const formatTime = (time) => {
    if (isNaN(time)) return "00:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // 2. 사용자가 스트리밍 바를 클릭하거나 드래그해서 위치를 변경했을 때
  const handleSeek = (e) => {
    const targetTime = Number(e.target.value);
    setCurrentTime(targetTime);
    if (audioRef.current) {
      audioRef.current.currentTime = targetTime; 
    }
  };

  const showAlert = (msg) => {
    setAlertMessage(msg);
    setIsAlertOpen(true);
  };

  // 오디오 메타데이터 로드 시 전체 길이를 설정하고 재생 시 현재 시간을 추적하는 로직 추가
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [activeTrack, isMyRoomOpen]);

  // 유저 프로필 로드 함수
  useEffect(() => {
    async function loadUserProfile(userId) {
      try {
        const response = await fetch(`${BACKEND_URL}/api/user/${userId}`);
        if (!response.ok) {
          throw new Error("서버 에러 또는 유저 정보 없음");
        }
        const userData = await response.json();
        console.log("유저 프로필 로드 완료:", userData);
      } catch (error) {
        console.warn("프로필 조회 실패 (서버가 아직 켜지지 않았거나 라우트가 준비되지 않았을 수 있습니다):", error.message);
      }
    }
    if (user) {
      loadUserProfile(user.uid);
    }
  }, [user, BACKEND_URL]);

  useEffect(() => {
    const handlePaymentMessage = (event) => {
      if (event.data && event.data.type === 'PAYMENT_SUCCESS') {
        showAlert(`🎉 크레딧이 성공적으로 충전되었습니다!\n현재 잔액: ${event.data.currentCredits} P`);
        setCredits(event.data.currentCredits);
      }
    };
    window.addEventListener('message', handlePaymentMessage);
    return () => window.removeEventListener('message', handlePaymentMessage);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const code = new URL(window.location.href).searchParams.get("code");
    if (code && window.location.pathname === "/oauth/kakao") {
      if (kakaoAuthRun.current) return;
      kakaoAuthRun.current = true;
      handleKakaoLoginBackend(code);
    }
  }, []);

  const handleKakaoLoginBackend = async (code) => {
    try {
      showAlert("🍑 카카오 보안 인증을 진행하고 있습니다...");
      const response = await fetch(`${BACKEND_URL}/api/auth/kakao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await response.json();
      if (data.success && data.customToken) {
        if (!auth) {
          showAlert("Firebase 가동 상태가 바르지 않아 로그인을 완료할 수 없습니다.");
          return;
        }
        await signInWithCustomToken(auth, data.customToken);
        window.history.replaceState({}, document.title, "/");
        showAlert("카카오 간편 로그인이 성공적으로 완료되었습니다! 🎉");
      } else {
        showAlert(`인증 실패: ${data.error}`);
      }
    } catch (err) {
      showAlert(`네트워크 오류: ${err.message}`);
    }
  };

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const idToken = await currentUser.getIdToken();
          const response = await fetch(`${BACKEND_URL}/api/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            }
          });
          const result = await response.json();
          if (result.success) {
            setCredits(result.data.credits);
          }
        } catch (err) {
          console.error("백엔드 회원 연동 오류:", err);
        }
      } else {
        setUser(null);
        setCredits(0);
      }
    });
    return () => unsubscribe();
  }, [BACKEND_URL]);

  const handleBirthdayChange = (dateString) => {
    setPetBirthday(dateString);
    if (!dateString) return;

    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();

    let zodiac = "";
    if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) zodiac = "양자리 ♈";
    else if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) zodiac = "황소자리 ♉";
    else if ((month === 5 && day >= 21) || (month === 6 && day <= 21)) zodiac = "쌍둥이자리 ♊";
    else if ((month === 6 && day >= 22) || (month === 7 && day <= 22)) zodiac = "게자리 ♋";
    else if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) zodiac = "사자자리 ♌";
    else if ((month === 8 && day >= 23) || (month === 9 && day <= 23)) zodiac = "처녀자리 ♍";
    else if ((month === 9 && day >= 24) || (month === 10 && day <= 22)) zodiac = "천칭자리 ♎";
    else if ((month === 10 && day >= 23) || (month === 11 && day <= 22)) zodiac = "전갈자리 ♏";
    else if ((month === 11 && day >= 23) || (month === 12 && day <= 24)) zodiac = "사수자리 ♐";
    else if ((month === 12 && day >= 25) || (month === 1 && day <= 19)) zodiac = "염소자리 ♑";
    else if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) zodiac = "물병자리 ♒";
    else zodiac = "물고기자리 ♓";

    const stones = ["가넷 ❤️", "자수정 💜", "아쿠아마린 🩵", "다이아몬드 💎", "에메랄드 💚", "진주 🤍", "루비 ❤️", "페리도트 💚", "사파이어 💙", "오팔 💖", "토파즈 💛", "터키석 🩵"];
    const stone = stones[month - 1] || "다이아몬드 💎";

    const flowers = ["수선화 💛", "제비꽃 💜", "데이지 🤍", "스위트피 💖", "은방울꽃 🤍", "장미 🌹", "델피늄 💙", "글라디올러스 ❤️", "과꽃 💜", "카렌듈라 💛", "국화 🤍", "포인세티아 ❤️"];
    const flower = flowers[month - 1] || "장미 🌹";

    setPetZodiac(zodiac);
    setPetStone(stone);
    setPetFlower(flower);
  };

  const startCamera = async (facing = 'user') => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      setIsCameraActive(true);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false
      });
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      showAlert("카메라 장치를 시작할 수 없습니다. 권한을 확인해 주세요: " + err.message);
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const toggleCameraFacing = () => {
    const nextFacing = cameraFacingMode === 'user' ? 'environment' : 'user';
    setCameraFacingMode(nextFacing);
    if (isCameraActive) {
      startCamera(nextFacing);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      setJacketImage(canvas.toDataURL('image/jpeg'));
      stopCamera();
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setJacketImage(event.target.result);
        stopCamera();
      };
      reader.readAsDataURL(file);
    }
  };

  const addSticker = (emoji) => {
    const newSticker = {
      id: Date.now(),
      emoji,
      x: 120,
      y: 120,
      scale: 1.5,
      rotate: 0
    };
    setStickers([...stickers, newSticker]);
    setSelectedStickerId(newSticker.id);
  };

  const deleteSelectedSticker = () => {
    setStickers(stickers.filter(s => s.id !== selectedStickerId));
    setSelectedStickerId(null);
  };

  const handleStickerDrag = (id, e) => {
    if (!jacketAreaRef.current) return;
    const rect = jacketAreaRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const relativeX = clientX - rect.left - 20;
    const relativeY = clientY - rect.top - 20;

    setStickers(stickers.map(s => {
      if (s.id === id) {
        return { ...s, x: relativeX, y: relativeY };
      }
      return s;
    }));
  };

  const updateSelectedStickerProp = (prop, value) => {
    setStickers(stickers.map(s => {
      if (s.id === selectedStickerId) {
        return { ...s, [prop]: value };
      }
      return s;
    }));
  };

  const saveFinishedJacket = () => {
    if (!jacketImage) {
      showAlert("자켓에 사용할 배경 이미지를 먼저 선택/촬영해 주세요!");
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');

    const bgImg = new Image();
    bgImg.crossOrigin = "anonymous";
    bgImg.src = jacketImage;
    
    bgImg.onload = () => {
      ctx.filter = `
        brightness(${imageFilters.brightness}%) 
        contrast(${imageFilters.contrast}%) 
        saturate(${imageFilters.saturate}%) 
        grayscale(${imageFilters.grayscale}%) 
        blur(${imageFilters.blur}px)
      `;

      if (frameStyle === 'polaroid') {
        ctx.fillStyle = '#fcfbf7';
        ctx.fillRect(0, 0, 400, 400);
        ctx.drawImage(bgImg, 15, 15, 370, 305);
      } else {
        ctx.drawImage(bgImg, 0, 0, 400, 400);
      }
      
      ctx.filter = 'none';

      if (frameStyle === 'polaroid') {
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 16px "Pretendard", sans-serif';
        ctx.textAlign = 'center';
        const displayLabel = `HAPPY BIRTHDAY TO ${petName ? petName.toUpperCase() : '우리 아이'}`;
        ctx.fillText(displayLabel, 200, 365);
      } else if (frameStyle === 'neon') {
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 12;
        ctx.strokeRect(6, 6, 388, 388);
      } else if (frameStyle === 'wood') {
        ctx.strokeStyle = '#7c2d12'; 
        ctx.lineWidth = 24;
        ctx.strokeRect(12, 12, 376, 376);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.strokeRect(23, 23, 354, 354);
      }

      stickers.forEach(st => {
        ctx.save();
        ctx.translate(st.x + 20, st.y + 20);
        ctx.rotate((st.rotate * Math.PI) / 180);
        ctx.font = `${st.scale * 24}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(st.emoji, 0, 0);
        ctx.restore();
      });

      const dataUrl = canvas.toDataURL('image/png');
      setJacketImage(dataUrl); 
      const link = document.createElement('a');
      link.download = `${petName || 'my-pet'}-birthday-jacket.png`;
      link.href = dataUrl;
      link.click();

      showAlert("🎨 나만의 앨범 자켓이 성공적으로 구워져 저장되었습니다!");
    };
  };

  const handleAuthSubmit = async () => {
    if (!auth) {
      showAlert("Firebase가 정상 가동되지 않는 상태입니다.");
      return;
    }
    if (!loginEmail || !loginPassword) {
      showAlert("이메일과 비밀번호를 모두 입력해 주세요!");
      return;
    }
    try {
      try {
        await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      } catch (loginErr) {
        if (loginErr.code === 'auth/user-not-found' || loginErr.code === 'auth/invalid-credential') {
          await createUserWithEmailAndPassword(auth, loginEmail, loginPassword);
          showAlert("반갑습니다! 계정 생성이 완료되어 로그인되었습니다 🎉");
        } else {
          throw loginErr;
        }
      }
      setIsLoginModalOpen(false);
    } catch (err) {
      showAlert(`인증 처리 오류: ${err.message}`);
    }
  };

  const handleGoogleLogin = async () => {
    if (!auth) {
      showAlert("Firebase 설정을 먼저 확인해 주세요.");
      return;
    }
    const googleProvider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, googleProvider);
      setIsLoginModalOpen(false);
      showAlert(`반갑습니다, ${result.user.displayName || '보호자'}님! 구글 간편 로그인이 완료되었습니다 🎉`);
    } catch (err) {
      showAlert(`구글 인증 처리 오류: ${err.message}`);
    }
  };

  const handleLogout = async () => {
    if (!auth) return;
    await signOut(auth);
    showAlert("로그아웃되었습니다.");
  };

  const handleOpenPaymentPortal = async () => {
    if (!user) {
      showAlert("🐾 크레딧을 충전하시려면 로그인이 필요합니다!");
      setIsLoginModalOpen(true);
      return;
    }
    const paymentPopup = window.open("about:blank", "크레딧 충전 결제소 💎", "width=500,height=680,resizable=no,scrollbars=yes,status=no,location=no");
    if (!paymentPopup) {
      showAlert("⚠️ 팝업 차단기가 활성화되어 있습니다. 주소창 우측에서 팝업 허용을 활성화해 주세요!");
      return;
    }
    try {
      const idToken = await user.getIdToken();
      paymentPopup.location.href = `/payment.html?token=${encodeURIComponent(idToken)}&backend=${encodeURIComponent(BACKEND_URL)}`;
    } catch (err) {
      paymentPopup.close();
      showAlert("보안 인증 토큰을 발급하지 못했습니다: " + err.message);
    }
  };

  const pollSongStatus = (taskId, title, lyricsText) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/song-status/${taskId}`);
        const data = await response.json();
        
        if (data.status === 'SUCCESS' && data.audioUrl) {
          clearInterval(interval);
          setIsLoading(false);
          
          const trackData = {
            audioUrl: data.audioUrl,
            lyric: data.lyric || lyricsText,
            title: title || `${petName}의 생일 축하송`,
            jacketUrl: jacketImage || "https://images.stockcake.com/public/d/5/4/d5415707-167e-40fb-886e-b2d075ebfa39_large/decorated-birthday-cake-stockcake.jpg"
          };
          setActiveTrack(trackData);
          setIsMyRoomOpen(true);
          showAlert("🎉 축하합니다! 우리 아이의 세상에 단 하나뿐인 명작 노래가 완성되었습니다!");
        } else if (data.status === 'FAILED') {
          clearInterval(interval);
          setIsLoading(false);
          showAlert("❌ 음원 제작에 최종 실패했습니다. 관리자에게 문의바랍니다.");
        }
      } catch (err) {
        console.error("폴링 오류:", err);
      }
    }, 8000);
  };

  const handleSunoAutoModeClick = async () => {
    if (!petName || !petBirthday) {
      showAlert("우리 아이 이름과 생일 날짜를 먼저 입력해 주세요!");
      return;
    }
    if (!user) {
      showAlert("🐾 가입하고 보너스 포인트로 무료 구워보세요!");
      setIsLoginModalOpen(true);
      return;
    }
    if (credits < 5) {
      showAlert("💎 크레딧이 부족합니다! 충전소를 띄워드릴게요.");
      handleOpenPaymentPortal();
      return;
    }

    setIsLoading(true);
    setLoadingText('Suno 엔진이 가사와 멜로디를 동시 조립하고 있습니다...');

    try {
      const idToken = await user.getIdToken();
      const defaultSunoPrompt = `A beautiful pet birthday celebration song dedicated to ${petName}. Genre is ${musicGenre}.`;

      const response = await fetch(`${BACKEND_URL}/api/generate-song`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          prompt: defaultSunoPrompt,
          genre: musicGenre,
          title: `${petName}의 AI 헌정 생일송`,
          lyricMode: 'suno',
          name: petName
        })
      });

      const resData = await response.json();
      if (response.status >= 400) {
        setIsLoading(false);
        showAlert(`❌ 음원 제작 거절: ${resData.error || '백엔드 응답 실패'}`);
        return;
      }

      if (resData.success && resData.taskId) {
        setCredits(prev => Math.max(0, prev - 5));
        pollSongStatus(resData.taskId, `${petName}의 AI 헌정 생일송`, defaultSunoPrompt);
      } else {
        setIsLoading(false);
        showAlert(`의뢰 처리 실패: ${resData.error}`);
      }
    } catch (err) {
      setIsLoading(false);
      showAlert(`서버 네트워크 전송 오류: ${err.message}`);
    }
  };

  const handleGenerateLyrics = async () => {
    if (!petName || !petBirthday) {
      showAlert("우리 아이 이름과 생일 날짜를 모두 채워주셔야 음악이 구워집니다!");
      return;
    }
    if (!user) {
      setIsLoginModalOpen(true);
      return;
    }
    if (credits < 5) {
      handleOpenPaymentPortal();
      return;
    }

    setIsLoading(true);
    setLoadingText('Gemini AI가 프리미엄 가사를 작성 중입니다...');

    try {
      const response = await fetch(`${BACKEND_URL}/api/generate-lyrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: petName,
          zodiac: petZodiac,
          stone: petStone,
          flower: petFlower,
          fixedChorus,
          genre: musicGenre,
          isSunoAutoMode: false
        })
      });

      const data = await response.json();
      if (response.status >= 400 || !data.lyrics) {
        setIsLoading(false);
        showAlert(`❌ 가사 생성 실패: ${data.error || 'Gemini 서버 과부하'}`);
        return;
      }

      setLoadingText('Suno 음향 엔진에 의뢰를 전송 중입니다...');
      const idToken = await user.getIdToken();
      const songResponse = await fetch(`${BACKEND_URL}/api/generate-song`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          prompt: data.lyrics,
          genre: musicGenre,
          title: `${petName}의 맞춤 생일송`,
          lyricMode: 'custom',
          name: petName
        })
      });

      const songData = await songResponse.json();
      if (songResponse.status >= 400 || !songData.success) {
        setIsLoading(false);
        showAlert(`❌ 음원 생성 실패: ${songData.error || 'Suno 연결 거절'}`);
        return;
      }

      setCredits(prev => Math.max(0, prev - 5));
      pollSongStatus(songData.taskId, `${petName}의 생일 축하송`, data.lyrics);

    } catch (err) {
      setIsLoading(false);
      showAlert(`제작 에러 발생: ${err.message}`);
    }
  };

  const handleBakeVideo = async () => {
    if (!activeTrack || !activeTrack.audioUrl) return;
    const finalJacket = jacketImage || "https://images.stockcake.com/public/d/5/4/d5415707-167e-40fb-886e-b2d075ebfa39_large/decorated-birthday-cake-stockcake.jpg";
    showAlert("🎬 MP4 동영상 비디오로 굽기 시작합니다.");

    try {
      const response = await fetch(`${BACKEND_URL}/api/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioUrl: activeTrack.audioUrl,
          jacketImage: finalJacket
        })
      });

      const resData = await response.json();
      if (resData.success && resData.videoUrl) {
        const link = document.createElement('a');
        link.href = resData.videoUrl;
        link.download = `${petName || 'pet'}-birthday-music-video.mp4`;
        link.click();
        showAlert("🎉 동영상 합성이 완벽히 성공했습니다!");
      } else {
        showAlert("❌ 비디오 인코딩 중 실패했습니다: " + resData.error);
      }
    } catch (err) {
      showAlert("서버 비디오 가공 전송 실패: " + err.message);
    }
  };

  const handleAudioPlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().catch(e => console.log("재생 거절됨:", e));
        setIsPlaying(true);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-start p-6">
      
      {/* 🔮 역동적 이퀄라이저 애니메이션을 위한 인라인 스타일 정의 */}
      <style>{`
        @keyframes dancings {
          0% { height: 10%; }
          100% { height: 100%; }
        }
        .dancing-bar {
          animation: dancings 0.6s ease-in-out infinite alternate;
        }
        .animate-spin-slow {
          animation: spin 16s linear infinite;
        }
        .animate-spin-faster {
          animation: spin 1s linear infinite;
        }
      `}</style>

      {/* 🐾 헤더 및 계정 정보 */}
      <div className="w-full max-w-4xl bg-slate-800 rounded-3xl p-6 shadow-2xl mb-6 flex flex-col md:flex-row justify-between items-center gap-4 border border-slate-700">
        <div className="flex items-center gap-3">
          <span className="text-4xl">🐾</span>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-indigo-100">반려동물 생일송 메이커</h1>
            <p className="text-xs text-slate-400">우리 아이의 생물학 정보로 가사와 세련된 자켓을 제작합니다.</p>
          </div>
        </div>

        <div>
          {user ? (
            <div className="flex items-center gap-3 bg-slate-700 p-2.5 rounded-2xl border border-slate-600">
              <span className="text-xs font-bold text-slate-300">{user.email || '동기화 완료'}</span>
              <span className="bg-yellow-400 text-slate-950 font-extrabold text-xs px-2.5 py-1 rounded-full">💎 {credits} P</span>
              <button onClick={handleLogout} className="text-xs font-bold text-red-400 hover:text-red-300 ml-1">로그아웃</button>
            </div>
          ) : (
            <button 
              onClick={() => setIsLoginModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-500 font-bold px-5 py-2.5 rounded-2xl text-xs shadow-lg transition"
            >
              🔐 회원 인증 / 로그인
            </button>
          )}
        </div>
      </div>

      {/* 🎨 자켓스튜디오 인터랙티브 패널 */}
      <div className="w-full max-w-4xl bg-slate-800 rounded-3xl p-6 shadow-2xl mb-6 border border-indigo-500/30 overflow-hidden">
        <div 
          onClick={() => setIsJacketStudioOpen(!isJacketStudioOpen)}
          className="flex justify-between items-center cursor-pointer select-none group"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl animate-pulse">🎨</span>
            <div>
              <h2 className="text-base font-black text-indigo-300 group-hover:text-indigo-200 transition">내 아이 앨범 자켓스튜디오</h2>
              <p className="text-[11px] text-slate-400">카메라 촬영 및 예쁜 스티커, 액자로 세상에 하나뿐인 앨범 아트를 꾸며보세요.</p>
            </div>
          </div>
          <span className="text-slate-400 text-lg group-hover:text-indigo-400 transition-all duration-200">
            {isJacketStudioOpen ? "▲" : "▼"}
          </span>
        </div>
      
        {isJacketStudioOpen && (
          <div className="mt-6 pt-6 border-t border-slate-700/60 grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* 좌측: 데코레이션 뷰포트 */}
            <div className="flex flex-col items-center justify-center">
              <div 
                ref={jacketAreaRef}
                className="relative w-72 h-72 bg-slate-950 rounded-2xl overflow-hidden shadow-2xl select-none cursor-crosshair"
                style={{
                  border: frameStyle === 'neon' ? '6px solid #a855f7' : frameStyle === 'wood' ? '12px solid #7c2d12' : '2px solid #334155'
                }}
              >
                {isCameraActive && (
                  <video 
                    ref={videoRef}
                    autoPlay 
                    playsInline 
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}

                {jacketImage && !isCameraActive && (
                  <img 
                    src={jacketImage} 
                    alt="자켓 배경" 
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{
                      filter: `
                        brightness(${imageFilters.brightness}%) 
                        contrast(${imageFilters.contrast}%) 
                        saturate(${imageFilters.saturate}%) 
                        grayscale(${imageFilters.grayscale}%) 
                        blur(${imageFilters.blur}px)
                      `
                    }}
                  />
                )}

                {!jacketImage && !isCameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-4 text-center">
                    <span className="text-3xl mb-2">📸</span>
                    <p className="text-xs">카메라를 켜거나 사진을 불러와서 꾸미기를 시작하세요!</p>
                  </div>
                )}

                {frameStyle === 'polaroid' && (
                  <div className="absolute bottom-0 inset-x-0 h-16 bg-white text-slate-800 flex flex-col justify-center items-center px-2">
                    <span className="text-[10px] font-black tracking-tight text-slate-800">
                      HAPPY BIRTHDAY TO {petName ? petName.toUpperCase() : '우리 아이'}
                    </span>
                  </div>
                )}

                {stickers.map((st) => (
                  <div
                    key={st.id}
                    onTouchMove={(e) => handleStickerDrag(st.id, e)}
                    onDragOver={(e) => e.preventDefault()}
                    onMouseDown={() => setSelectedStickerId(st.id)}
                    className={`absolute cursor-move select-none p-1 rounded ${selectedStickerId === st.id ? 'border-2 border-indigo-400 bg-indigo-500/10' : ''}`}
                    style={{
                      left: `${st.x}px`,
                      top: `${st.y}px`,
                      transform: `rotate(${st.rotate}deg)`,
                      fontSize: `${st.scale * 20}px`
                    }}
                    draggable
                    onDrag={(e) => {
                      if (e.clientX === 0 && e.clientY === 0) return;
                      handleStickerDrag(st.id, e);
                    }}
                  >
                    {st.emoji}
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-4">
                {!isCameraActive ? (
                  <button 
                    onClick={() => startCamera(cameraFacingMode)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 transition"
                  >
                    카메라 구동
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={capturePhoto}
                      className="bg-green-600 hover:bg-green-500 text-white font-extrabold text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 transition"
                    >
                      찰칵! 캡처
                    </button>
                    <button 
                      onClick={toggleCameraFacing}
                      className="bg-slate-700 hover:bg-slate-600 text-white font-extrabold text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 transition"
                    >
                      앞/뒤 전환
                    </button>
                    <button 
                      onClick={stopCamera}
                      className="bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs px-3 py-2 rounded-xl transition"
                    >
                      취소
                    </button>
                  </>
                )}

                <label className="cursor-pointer bg-slate-700 hover:bg-slate-600 text-white font-extrabold text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 transition">
                  사진 첨부하기
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleImageUpload} 
                  />
                </label>
              </div>
            </div>

            {/* 우측: 스튜디오 조작 다이얼 */}
            <div className="space-y-4">
              <div>
                <span className="block text-xs font-bold text-slate-300 mb-2">🎈 스티커 얹기</span>
                <div className="flex flex-wrap gap-2.5 bg-slate-900/60 p-3 rounded-2xl border border-slate-700/80">
                  {['👑', '🥳', '🎈', '🎂', '🕶️', '🌸', '❤️', '🌟', '🧁', '🎀', '🐶', '🐱'].map(emoji => (
                    <button 
                      key={emoji}
                      onClick={() => addSticker(emoji)}
                      className="text-2xl hover:scale-125 transition active:scale-95 duration-100"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {selectedStickerId && (
                <div className="bg-slate-900/40 border border-indigo-500/20 p-3 rounded-2xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-yellow-300 font-extrabold">✨ 선택한 스티커 조정하기</span>
                    <button onClick={deleteSelectedSticker} className="text-red-400 hover:text-red-300 text-[10px] font-bold">지우기 🗑️</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] text-slate-400 mb-0.5">크기 배율</label>
                      <input 
                        type="range" min="0.5" max="3" step="0.1"
                        value={stickers.find(s => s.id === selectedStickerId)?.scale || 1.5}
                        onChange={(e) => updateSelectedStickerProp('scale', parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-slate-400 mb-0.5">회전 각도</label>
                      <input 
                        type="range" min="-180" max="180" step="5"
                        value={stickers.find(s => s.id === selectedStickerId)?.rotate || 0}
                        onChange={(e) => updateSelectedStickerProp('rotate', parseInt(e.target.value))}
                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 액자 옵션 */}
              <div>
                <span className="block text-xs font-bold text-slate-300 mb-1.5">🖼️ 프레임 액자</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { style: 'none', label: '민무늬' },
                    { style: 'polaroid', label: '폴라로이드' },
                    { style: 'neon', label: '네온퍼플' },
                    { style: 'wood', label: '나무 프레임' }
                  ].map(fr => (
                    <button
                      key={fr.style}
                      onClick={() => setFrameStyle(fr.style)}
                      className={`py-1.5 rounded-lg text-[10px] font-bold border transition ${frameStyle === fr.style ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-900 border-slate-700 text-slate-400'}`}
                    >
                      {fr.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 필터 슬라이더 */}
              <div>
                <span className="block text-xs font-bold text-slate-300 mb-1.5">🪄 사진 색감 보정 필터</span>
                <div className="grid grid-cols-2 gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-700/80">
                  <div>
                    <label className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                      <span>밝기 보정</span>
                      <span>{imageFilters.brightness}%</span>
                    </label>
                    <input 
                      type="range" min="50" max="150" 
                      value={imageFilters.brightness}
                      onChange={(e) => setImageFilters({...imageFilters, brightness: parseInt(e.target.value)})}
                      className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                      <span>대비(선명)</span>
                      <span>{imageFilters.contrast}%</span>
                    </label>
                    <input 
                      type="range" min="50" max="150" 
                      value={imageFilters.contrast}
                      onChange={(e) => setImageFilters({...imageFilters, contrast: parseInt(e.target.value)})}
                      className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <button 
                onClick={saveFinishedJacket}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-550 hover:to-indigo-550 text-white font-black py-3 rounded-xl text-xs transition shadow-lg flex items-center justify-center gap-2 border border-purple-500"
              >
                <span>💾</span> <span>완성된 앨범 자켓 다운로드하기</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 🛠 *메인 프로필 양식 */}
      <div className="w-full max-w-4xl bg-slate-800 rounded-3xl p-8 shadow-2xl grid grid-cols-1 md:grid-cols-2 gap-8 border border-slate-700">
        
        {/* 프로필 작성 */}
        <div className="space-y-5">
          <h3 className="text-lg font-bold border-b border-slate-700 pb-2 text-indigo-400 flex items-center gap-2">
            <span>🐾 프로필 작성</span>
          </h3>
          
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5">우리 아이 이름</label>
            <input 
              type="text" 
              placeholder="예: 초코, 보리" 
              value={petName}
              onChange={(e) => setPetName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition text-slate-200" 
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5">탄생 연월일</label>
            <input 
              type="date" 
              value={petBirthday}
              onChange={(e) => handleBirthdayChange(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition text-slate-200" 
            />
          </div>
        </div>

        {/* 음원 상세 세팅 (우측) */}
        <div className="space-y-5">
          <h3 className="text-lg font-bold border-b border-slate-700 pb-2 text-indigo-400 flex items-center gap-2">
            <span>🎵 음악 및 코러스 스타일</span>
          </h3>

          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5">원하는 멜로디 장르</label>
            <select 
              value={musicGenre}
              onChange={(e) => setMusicGenre(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition text-slate-300"
            >
              <option value="pop">경쾌하고 신나는 K-POP 🎵</option>
              <option value="acoustic">감성 충만 어쿠스틱 발라드 🎸</option>
              <option value="jazz">달콤하고 부드러운 스윙 재즈 🎷</option>
              <option value="rock">파워풀하고 신나는 모던 록 ⚡</option>
              <option value="semi trot">신나고 흥겨운 트로트 🎤</option>
              <option value="Gospel Choir">웅장한 성가대 합창단 ⚡</option>
            </select>
          </div>
       
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5">꼭 들어갔으면 하는 축하 문구</label>
            <input 
              type="text" 
              placeholder="예: 평생 행복하게 함께하자" 
              value={fixedChorus}
              onChange={(e) => setFixedChorus(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition text-slate-200" 
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5">제작 방식 선택</label>
            <div className="relative w-full bg-slate-950 p-1.5 rounded-2xl border border-slate-850 flex items-center h-14 cursor-pointer select-none">
              <div
                className={`absolute top-1.5 bottom-1.5 w-[calc(50%-8px)] bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl transition-all duration-300 ease-out shadow-[0_4px_16px_rgba(99,102,241,0.35)] ${
                  lyricMode === 'suno' ? 'left-[calc(50%+4px)]' : 'left-1.5'
                }`}
              />
              
              <button 
                type="button"
                onClick={() => setLyricMode('custom')}
                className={`relative z-10 flex-1 h-full text-xs font-black transition-colors duration-300 flex items-center justify-center ${
                  lyricMode === 'custom' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Gemini 맞춤형 작사
              </button>

              <button 
                type="button"
                onClick={() => setLyricMode('suno')}
                className={`relative z-10 flex-1 h-full text-xs font-black transition-colors duration-300 flex items-center justify-center gap-1.5 ${
                  lyricMode === 'suno' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Suno 완전 자동</span>
                <span className={`transition-transform duration-300 ${lyricMode === 'suno' ? 'scale-125' : 'scale-100'}`}>
                  💎 <strong className="text-yellow-400">5</strong>
                </span>
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* 실행 및 안내 영역 */}
      <div className="mt-8 text-center space-y-3 w-full max-w-lg">
        {lyricMode === 'custom' ? (
          <button 
            onClick={handleGenerateLyrics}
            disabled={isLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 font-extrabold py-4 rounded-2xl text-base shadow-xl transition flex items-center justify-center gap-3 disabled:opacity-50 border border-indigo-500"
          >
            {isLoading ? (
              <>
                <span className="animate-spin-faster text-lg">⏳</span>
                <span className="text-xs">{loadingText}</span>
              </>
            ) : (
              <span>✨ Gemini 맞춤형 생일송 가사제작하기</span>
            )}
          </button>
        ) : (
          <button 
            onClick={handleSunoAutoModeClick}
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-550 hover:to-indigo-550 py-4 rounded-2xl text-base font-black text-white shadow-lg transition border border-purple-400 disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {isLoading ? (
              <>
                <span className="animate-spin-faster text-lg">🎵</span>
                <span className="text-xs">{loadingText}</span>
              </>
            ) : (
              <div className="flex items-center gap-2.5">
                <span>🚀 Suno 완전 자동 생일송 만들기</span>
                <span className="bg-yellow-400 text-slate-950 font-black text-xs px-2.5 py-1 rounded-full flex items-center gap-1 shadow-md">
                  <span>💎</span> <span>5</span>
                </span>
              </div>
            )}
          </button>
        )}
        <p className="text-[11px] text-slate-400">
          {lyricMode === 'custom' 
            ? "가사를 먼저 작성한 뒤, 음악을 마음에 맞게 구울지 자유롭게 고를 수 있습니다."
            : "가사 검수 단계 없이 완창용 음원 제작 프로세스로 즉시 급행 전송됩니다."}
        </p>
      </div>

      {/* 🐾 마이룸 스트리밍 센터 모달 */}
      {isMyRoomOpen && activeTrack && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-slate-900 border-2 border-indigo-500/40 rounded-3xl max-w-xl w-full p-8 shadow-[0_0_50px_rgba(99,102,241,0.3)] relative overflow-hidden">
            
            <div className="absolute -right-16 -top-16 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl"></div>
            
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-indigo-300 flex items-center gap-2">
                <span>🐾 My Room 라이브룸</span>
              </h3>
              <button 
                onClick={() => {
                  if (audioRef.current) audioRef.current.pause();
                  setIsPlaying(false);
                  setIsMyRoomOpen(false);
                }} 
                className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded-xl text-xs font-bold transition"
              >
                닫기 ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* 회전 턴테이블 자켓 구역 */}
              <div className="flex flex-col items-center justify-center">
                <div className="relative w-48 h-48 rounded-full overflow-hidden shadow-[0_10px_35px_rgba(0,0,0,0.6)] border-4 border-slate-950 bg-slate-950 flex items-center justify-center group">
                  <img 
                    src={activeTrack.jacketUrl} 
                    alt="앨범 자켓" 
                    className={`w-full h-full object-cover rounded-full ${isPlaying ? 'animate-spin-slow' : ''}`}
                  />
                  <div className="absolute w-10 h-10 bg-slate-900 border-4 border-slate-950 rounded-full flex items-center justify-center">
                    <div className="w-2.5 h-2.5 bg-yellow-400 rounded-full"></div>
                  </div>
                </div>
                <h4 className="text-center font-bold text-sm text-slate-100 mt-4 max-w-xs truncate">{activeTrack.title}</h4>
                <p className="text-center text-[10px] text-slate-400 mt-1">Suno V4.5 가창 버전</p>
              </div>

              {/* 가사 본문 영역 */}
              <div className="bg-slate-950/80 rounded-2xl p-4 h-56 overflow-y-auto border border-slate-800">
                <span className="block text-[10px] font-black tracking-widest text-indigo-400 mb-2">📜 실시간 싱크 가사</span>
                <pre className="text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-line text-center">
                  {activeTrack.lyric}
                </pre>
              </div>
            </div>

            {/* 실시간 댄싱 이퀄라이저 바 */}
            <div className="h-10 flex items-end justify-center gap-1.5 my-6 px-10 bg-slate-950/40 rounded-xl py-2">
              {Array.from({ length: 18 }).map((_, i) => (
                <div 
                  key={i} 
                  className={`w-1.5 bg-gradient-to-t from-indigo-500 to-purple-500 rounded-t-full ${isPlaying ? 'dancing-bar' : 'h-[10%]'}`}
                  style={{ 
                    animationDelay: `${i * 0.08}s`,
                    animationDuration: isPlaying ? `${0.4 + Math.random() * 0.4}s` : '0s'
                  }}
                ></div>
              ))}
            </div>

            {/* 스트리밍 바 제어 */}
            <div className="streaming-bar-container w-full px-4 py-2">
              <input
                type="range"
                min="0"
                max={duration}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-pink-500 hover:h-2 transition-all"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-2 font-mono">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* 라이브 스트리밍 오디오 태그 및 플레이어 단추 */}
            <div className="flex flex-col items-center gap-4">
              <audio 
                ref={audioRef} 
                src={activeTrack.audioUrl} 
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                className="hidden"
                controls
              />
              
              <button 
                onClick={handleAudioPlayPause}
                className="bg-indigo-600 hover:bg-indigo-500 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition active:scale-95 duration-100 border-2 border-indigo-400"
              >
                {isPlaying ? (
                  <span className="text-xl">⏸️</span>
                ) : (
                  <span className="text-xl ml-1">▶️</span>
                )}
              </button>

              <div className="grid grid-cols-2 gap-3 w-full pt-4 border-t border-slate-800">
                <a 
                  href={activeTrack.audioUrl} 
                  download={`${petName || 'pet'}-birthday.mp3`}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold py-3 rounded-xl text-xs text-center block transition shadow-md"
                >
                  📥 MP3 파일 다운로드
                </a>
                <button 
                  onClick={handleBakeVideo}
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-550 hover:to-indigo-550 text-white font-black py-3 rounded-xl text-xs transition shadow-md border border-purple-500"
                >
                  🎬 자켓포함 MP4 굽기
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 통합 로그인 모달 */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl max-w-md w-full p-8 shadow-2xl relative">
            <button onClick={() => setIsLoginModalOpen(false)} className="absolute right-6 top-6 text-slate-400 hover:text-slate-200">✕</button>
            <h3 className="text-lg font-extrabold text-slate-100 mb-1">🔐 로그인 및 회원가입</h3>
            <p className="text-xs text-slate-400 mb-6">보안 모듈을 이용한 안전한 가입 공간입니다.</p>
            
            <div className="space-y-4">
              <button 
                onClick={() => window.location.href = KAKAO_AUTH_URL}
                className="w-full bg-[#FEE500] hover:bg-[#FDD101] text-[#191919] font-black py-3.5 rounded-xl text-xs transition flex items-center justify-center gap-2.5 border border-[#FDD101] shadow"
              >
                카카오 계정으로 1초 간편 로그인
              </button>

              <button 
                onClick={handleGoogleLogin}
                className="w-full bg-white hover:bg-slate-100 text-slate-900 font-bold py-3.5 rounded-xl text-xs transition flex items-center justify-center gap-2.5 border border-slate-200 shadow"
              >
                구글 아이디로 1초 간편 가입 / 로그인
              </button>

              <div className="flex items-center my-3">
                <div className="flex-1 border-t border-slate-700"></div>
                <span className="px-3 text-[10px] text-slate-500 font-bold">또는 이메일 직접 가입</span>
                <div className="flex-1 border-t border-slate-700"></div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">이메일 주소</label>
                <input 
                  type="email" 
                  placeholder="name@example.com" 
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-slate-200" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">비밀번호</label>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-slate-200" 
                />
              </div>
              <button 
                onClick={handleAuthSubmit}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl text-xs transition"
              >
                이메일 가입 및 로그인하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 알림 모달 */}
      {isAlertOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl max-w-xs w-full p-6 shadow-2xl text-center">
            <span className="text-4xl">💡</span>
            <h4 className="text-base font-bold text-slate-100 mt-3 mb-2">확인 메시지</h4>
            <p className="text-xs text-slate-300 mb-6 leading-relaxed whitespace-pre-line">{alertMessage}</p>
            <button 
              onClick={() => setIsAlertOpen(false)}
              className="w-full bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-extrabold py-3 rounded-xl text-xs transition"
            >
              확인했습니다 🐾
            </button>
          </div>
        </div>
      )}

    </div>
  );
}