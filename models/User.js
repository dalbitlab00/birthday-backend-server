// models/User.js 예시
import mongoose from 'mongoose';
const userSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, unique: true },
  email: { type: String },
  name: { type: String, default: '사용자' },
  credits: { type: Number, default: 2 } // ⭐️ 크레딧 타입 지정
}, {
  collection: 'users' // ⭐️ sample_mflix DB 안의 'users' 컬렉션을 명시
});
export const User = mongoose.model('User', userSchema);
//module.exports = mongoose.model('User', userSchema);