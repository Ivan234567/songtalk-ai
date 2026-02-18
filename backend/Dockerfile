FROM node:20-slim

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package.json package-lock.json* ./
RUN npm install --production --omit=dev && npm cache clean --force

# Копируем все остальные файлы
COPY . .

RUN npm run build

EXPOSE 8080

CMD ["npm", "start"]
