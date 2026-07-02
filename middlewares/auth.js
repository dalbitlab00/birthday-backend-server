import admin from 'firebase-admin';
import { User } from '../models/User.js';

// 클라이언트의 로그인 상태를 검문하는 기성화된 인증 미들웨어
export const authMiddleware = async (req, res, next) => {
  try {
    // 1. 브라우저가 보낸 요청 헤더(Headers)에서 Authorization 값을 가져옵니다.
    const authHeader = req.headers.authorization;
    
    // 헤더가 없거나 'Bearer '로 시작하지 않으면 쫓아냅니다.
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: '인증 토큰이 누락되었거나 형식이 올바르지 않습니다.' 
      });
    }

    // 2. 'Bearer abcde12345...' 형태에서 실제 토큰 값만 쏙 분리합니다.
    const token = authHeader.split('Bearer ')[1];

    // 3. Render에 숨겨둔 비밀키로 초기화된 Firebase Admin SDK를 통해 토큰 위변조 검증!
    // 구글 서버가 이 토큰이 유효한지 1초 만에 판별해 줍니다.
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // 4. 토큰 복호화에 성공하면 유저의 고유 uid가 나옵니다.
    const firebaseUid = decodedToken.uid;

    // 5. ★ 중요: 이 Firebase UID를 가진 유저가 우리 MongoDB에 있는지 조회합니다.
    let user = await User.findOne({ firebaseUid });

    // 6. 만약 Firebase에는 로그인되었는데 우리 MongoDB 장부에는 없는 유저라면? (최초 가입자)
    if (!user) {
      user = await User.create({
        firebaseUid: firebaseUid,
        email: decodedToken.email,
        nickname: decodedToken.name || '',
        credits: 3 // 🎁 회원가입 축하 기본 크레딧 지급!
      });
      console.log(`✨ 새 가입자 등록 완료: ${decodedToken.email}`);
    }

    // 7. 조회되거나 새로 생성된 유저 정보를 req.user에 안전하게 배달해 둡니다.
    // 이렇게 해두면 다음 라우터(결제창, 노래 메이커)에서 req.user.credits 처럼 바로 쓸 수 있습니다.
    req.user = user;
    
    // 검문 통과! 다음 로직(API 함수)으로 이동하라는 명령입니다.
    next();

  } catch (error) {
    console.error('❌ 인증 미들웨어 에러:', error);
    
    // 토큰이 만료되었거나 조작된 경우 안전하게 403 에러를 반환합니다.
    return res.status(403).json({ 
      success: false, 
      message: '유효하지 않거나 만료된 토큰입니다.' 
    });
  }
};