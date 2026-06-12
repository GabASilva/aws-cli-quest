# AWS CLI Quest — imagem mínima (Node sem dependências)
FROM node:20-alpine

WORKDIR /app
COPY . .

ENV PORT=8080
ENV DADOS_DIR=/dados
EXPOSE 8080

CMD ["node", "servidor.js"]
