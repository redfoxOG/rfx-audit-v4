FROM node:20-alpine as builder

WORKDIR /app
COPY . .

# safer for first-time builds if lockfile is missing or broken
RUN npm install
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
