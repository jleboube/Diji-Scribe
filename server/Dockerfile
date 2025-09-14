FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
# Use npm install and omit dev deps for production image
RUN npm install --omit=dev

COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "index.js"]
