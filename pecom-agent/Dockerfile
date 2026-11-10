FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=optional
COPY . .
RUN mkdir -p storage
CMD ["npx", "tsx", "src/bot.ts"]
