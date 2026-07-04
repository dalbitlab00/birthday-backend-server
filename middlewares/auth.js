import { getAuth } from 'firebase-admin/auth';
import { User } from '../models/User.js';

/**
 * 🔐 파이어베이스 ID 토큰을 실시간 검증하는 보안 문지기 미들웨어
 */
export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        error: "인증 헤더가 유실되었거나 형식이 바르지 않습니다." 
      });
    }

    const token = authHeader.split('Bearer ')[1];

    // 💡 [수정 포인트] admin.auth() 대신 최신 ESM 표준인 getAuth() 호출로 TypeError 완벽 해결!
    const decodedToken = await getAuth().verifyIdToken(token);

    // 디코딩된 Firebase UID를 기준으로 데이터베이스에서 실제 유저를 식별합니다.
    let user = await User.findOne({ firebaseUid: decodedToken.uid });

    // 데이터베이스에 등록되지 않은 신규 가입자라면 웰컴 보너스 5 크레딧과 함께 즉시 자동 가입 처리
    if (!user) {
      user = await User.create({
        firebaseUid: decodedToken.uid,
        email: decodedToken.email || `kakao-user-${decodedToken.uid.slice(0, 8)}@petmaker.com`,
        credits: 5
      });
      console.log(`🎉 신규 보호자님 자동 등록 성공: ${user.email} (5 P 지급)`);
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("❌ 인증 미들웨어 에러:", error.message);
    return res.status(403).json({ 
      success: false, 
      error: "보안 토큰 검증에 실패했습니다. 다시 로그인해 주세요." 
    });
  }
};