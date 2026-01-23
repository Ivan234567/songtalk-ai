FROM node:20

WORKDIR /app

# Копируем только файлы из папки backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm install

COPY backend/ .

RUN npm run build

EXPOSE 8080

CMD ["npm", "start"]
