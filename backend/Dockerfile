FROM node:20

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package.json package-lock.json* ./
RUN npm install

# Копируем все остальные файлы
COPY . .

RUN npm run build

EXPOSE 8080

CMD ["npm", "start"]
