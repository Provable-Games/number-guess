FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package.json ./
COPY package-lock.json* ./

# Install dependencies
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy source
COPY . .

# Build the indexer
RUN npm run build

# Check DNA server and start indexer
CMD npm run start -- --indexer=number-guess
