import { getAuth } from 'firebase-admin/auth';
import { User }  from '../models/User.js';

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

    const decodedToken = await getAuth().verifyIdToken(token);

    // 1. 디코딩된 Firebase UID를 기준으로 데이터베이스에서 실제 유저를 식별합니다.
    let user = await User.findOne({ firebaseUid: decodedToken.uid });

    // 💡 [계정 자동 연동 패치] UID는 매칭되지 않지만, 동일한 이메일을 가진 계정이 이미 DB에 존재할 때 충돌(E11000)을 막고 계정을 연동해 줍니다!
    if (!user) {
      if (decodedToken.email) {
        user = await User.findOne({ email: decodedToken.email });
      }

      if (user) {
        // 이미 동일 이메일의 유저가 존재하면 새 Firebase UID를 기존 유저 계정에 즉시 동기화(연결)하여 로그인 승인 처리합니다.
        user.firebaseUid = decodedToken.uid;
        await user.save();
        console.log(`🔗 기존 유저 계정 연동 성공 (${user.email}): 55 크레딧 데이터 보존 및 복구 완료!`);
      } else {
        // 이메일도 중복되지 않는 완전한 신규 가입자일 때만 웰컴 보너스와 함께 안전하게 신규 문서를 생성합니다.
        user = await User.create({
          firebaseUid: decodedToken.uid,
          email: decodedToken.email || `kakao-user-${decodedToken.uid.slice(0, 8)}@petmaker.com`,
          credits: 2
        });
        console.log(`🎉 신규 보호자님 자동 등록 성공: ${user.email} (2 P 지급)`);
      }
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