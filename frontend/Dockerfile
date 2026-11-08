# Build the React dashboard, then serve it with nginx (which also proxies API + WebSocket)
FROM node:20-alpine AS build
WORKDIR /app
# Only package.json: npm resolves the right native binaries for Alpine Linux
# (a package-lock.json made on another OS can miss them and break "npm run build")
COPY package.json ./
RUN npm install
COPY src ./src
COPY index.html vite.config.js ./
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
