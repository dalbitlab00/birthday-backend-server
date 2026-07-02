# 1. Node.js 기반의 경량화된 리눅스 이미지 사용
FROM node:20-slim

# 2. 시스템 패키지 업데이트 및 FFmpeg + 한글 폰트 설치
RUN apt-get update && apt-get install -y \
    ffmpeg \
    fonts-nanum \
    && rm -rf /var/lib/apt/lists/*

# 3. 앱 디렉토리 생성
WORKDIR /usr/src/app

# 4. 의존성 파일 복사 및 설치
COPY package*.json ./
RUN npm install

# 5. 프로젝트 나머지 코드 전체 복사
COPY . .

# 6. 포트 설정 (Render 환경에 맞춰 포트 개방)
EXPOSE 3001

# 7. 서버 실행 명령
CMD ["node", "server.js"]
