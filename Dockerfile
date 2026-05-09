FROM mcr.microsoft.com/playwright:v1.59.1-noble
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN find . -type f -name "*.sh" -exec sed -i 's/\r$//' {} + \
  && chmod +x scripts/*.sh *.sh \
  && mkdir -p reports/html reports/json reports/markdown reports/spreadsheet test-results storage
CMD ["bash", "scripts/agent-loop.sh"]
