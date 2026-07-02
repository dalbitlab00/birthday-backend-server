import mongoose from 'mongoose';

// 1. 반려동물 생일송 메이커를 위한 유저 데이터 구조(Schema) 정의
const userSchema = new mongoose.Schema({
  // Firebase Auth에서 발급한 고유 사용자 ID (회원 식별의 핵심 Key)
  firebaseUid: { 
    type: String, 
    required: true, 
    unique: true, // 중복 가입 방지
    index: true   // 로그인할 때 속도를 빠르게 하기 위해 인덱스 설정
  },
  
  // 사용자 이메일
  email: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,   // 앞뒤 공백 자동 제거
    lowercase: true // 대소문자 구분 없이 소문자로 저장
  },
  
  // 사용자의 닉네임 (선택 사항)
  nickname: {
    type: String,
    default: ''
  },
  
  // 유저가 보유 중인 AI 생일송 제작 크레딧 잔액
  credits: { 
    type: Number, 
    default: 3,   // 🎁 회원가입 시 축하 의미로 기본 지급할 크레딧 양 (예: 3크레딧)
    min: [0, '크레딧은 0보다 작을 수 없습니다.'] // 마이너스 크레딧 방지 보안
  }
}, { 
  // 가입일(createdAt)과 수정일(updatedAt)을 자동으로 기록해 주는 기성 옵션
  timestamps: true 
});

// 2. 정의한 스키마를 바탕으로 'User' 모델을 생성하여 내보내기
export const User = mongoose.model('User', userSchema);