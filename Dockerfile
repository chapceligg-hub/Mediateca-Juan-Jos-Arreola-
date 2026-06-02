# Stage 1: Build the React Application
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependency configs
COPY package*.json ./
RUN npm ci

# Copy full source and compile the production build
COPY . .
RUN npm run build

# Stage 2: Serve using an ultra-lightweight Nginx container
FROM nginx:1.25-alpine
WORKDIR /usr/share/nginx/html

# Clean default static assets
RUN rm -rf ./*

# Copy compiled files from builder stage
COPY --from=builder /app/dist .

# Custom Nginx configuration supporting clean SPA relative routes
RUN echo $'\n\
server {\n\
    listen 80;\n\
    location / {\n\
        root /usr/share/nginx/html;\n\
        index index.html index.htm;\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
    error_page 500 502 503 504 /50x.html;\n\
    location = /50x.html {\n\
        root /usr/share/nginx/html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
