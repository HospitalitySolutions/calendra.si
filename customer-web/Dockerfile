FROM node:24-bookworm
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 5174
CMD ["npm", "run", "dev"]
