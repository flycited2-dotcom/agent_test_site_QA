FROM mcr.microsoft.com/playwright:v1.59.1-noble
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN mkdir -p reports/html reports/json reports/markdown test-results storage
CMD ["bash", "scripts/agent-loop.sh"]
