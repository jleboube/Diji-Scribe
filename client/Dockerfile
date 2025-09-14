FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
# Use npm install since no lockfile is present
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Nginx config to proxy /api to server service
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
