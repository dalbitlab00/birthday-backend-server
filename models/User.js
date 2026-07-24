// models/User.js
import mongoose from 'mongoose';

// 반려동물 세부 스키마 (Subdocument)
const petSchema = new mongoose.Schema({
  petName: { type: String, required: true },
  birthDate: { type: Date, required: true },       // 전체 날짜 (예: 2021-08-15)
  birthMonth: { type: Number, required: true },      // 월 (1~12) - 빠른 조회를 위함
  birthDay: { type: Number, required: true },        // 일 (1~31) - 빠른 조회를 위함
  lastCongratulatedYear: { type: Number, default: 0 } // 올해 메일을 이미 보냈는지 체크 (중복 방지)
}, { _id: true });

const userSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, unique: true },
  email: { type: String },
  name: { type: String, default: '사용자' },
  credits: { type: Number, default: 2 },
  
  // ⭐️ 추가된 필드들
  marketingEmailOptIn: { type: Boolean, default: false }, // 마케팅 이메일 수신 동의 여부
  pets: [petSchema]                                        // 한 유저가 여러 반려동물을 등록할 수 있는 배열
}, {
  timestamps: true, // 생성/수정일 자동 기록 (createdAt, updatedAt)
  collection: 'users' // sample_mflix DB 안의 'users' 컬렉션 명시
});

// ⭐️ 매일 오전 생일 조회 쿼리 속도를 획기적으로 높여주는 복합 인덱스
userSchema.index({ "pets.birthMonth": 1, "pets.birthDay": 1 });

export const User = mongoose.model('User', userSchema);