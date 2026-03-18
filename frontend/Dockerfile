FROM node:18-alpine
WORKDIR /frontend
COPY package.json /frontend/package.json
COPY vite.config.js /frontend/vite.config.js
COPY index.html /frontend/index.html
COPY src /frontend/src
RUN npm install
EXPOSE 5173
CMD ["npm", "run", "dev"]
