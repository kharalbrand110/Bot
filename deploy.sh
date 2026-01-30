
### **File 11: deploy.sh**
```bash
#!/bin/bash

echo "========================================"
echo "🤖 WhatsApp Downloader Bot Setup"
echo "========================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}[1/6] Checking system requirements...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo "Please install Node.js 18 or higher from: https://nodejs.org"
    exit 1
else
    echo -e "${GREEN}✅ Node.js $(node -v)${NC}"
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
else
    echo -e "${GREEN}✅ npm $(npm -v)${NC}"
fi

echo -e "${BLUE}[2/6] Creating required directories...${NC}"

# Create directories
mkdir -p downloads
mkdir -p logs
mkdir -p backups
mkdir -p public

echo -e "${GREEN}✅ Directories created${NC}"

echo -e "${BLUE}[3/6] Installing Node.js dependencies...${NC}"

# Install npm dependencies
if npm install; then
    echo -e "${GREEN}✅ Dependencies installed successfully${NC}"
else
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi

echo -e "${BLUE}[4/6] Checking Python dependencies...${NC}"

# Check Python
if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
    echo -e "${YELLOW}⚠ Python not found, installing yt-dlp via pip may fail${NC}"
else
    echo -e "${GREEN}✅ Python available${NC}"
fi

# Check yt-dlp
if command -v yt-dlp &> /dev/null; then
    echo -e "${GREEN}✅ yt-dlp $(yt-dlp --version)${NC}"
else
    echo -e "${YELLOW}[4.5/6] Installing yt-dlp...${NC}"
    
    # Try pip3
    if command -v pip3 &> /dev/null; then
        if pip3 install yt-dlp; then
            echo -e "${GREEN}✅ yt-dlp installed via pip3${NC}"
        else
            echo -e "${YELLOW}⚠ Failed to install via pip3, trying pip...${NC}"
        fi
    fi
    
    # Try pip
    if command -v pip &> /dev/null; then
        if pip install yt-dlp; then
            echo -e "${GREEN}✅ yt-dlp installed via pip${NC}"
        else
            echo -e "${YELLOW}⚠ Failed to install yt-dlp. YouTube downloads may not work.${NC}"
            echo "You can install it manually:"
            echo "  pip3 install yt-dlp"
            echo "  OR"
            echo "  sudo apt install yt-dlp  # On Ubuntu/Debian"
        fi
    fi
fi

echo -e "${BLUE}[5/6] Setting up permissions...${NC}"

# Set permissions
chmod +x deploy.sh
chmod -R 755 downloads
chmod -R 755 public

echo -e "${GREEN}✅ Permissions set${NC}"

echo -e "${BLUE}[6/6] Creating environment file...${NC}"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    cat > .env << EOF
PORT=3000
NODE_ENV=development
SITE_URL=http://localhost:3000
EOF
    echo -e "${GREEN}✅ .env file created${NC}"
else
    echo -e "${YELLOW}⚠ .env file already exists${NC}"
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Setup completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}🎯 Next Steps:${NC}"
echo ""
echo "1. Start the bot:"
echo -e "   ${YELLOW}npm start${NC}"
echo ""
echo "2. Open in browser:"
echo -e "   ${YELLOW}http://localhost:3000${NC}"
echo ""
echo "3. WhatsApp Setup:"
echo "   • Open WhatsApp on your phone"
echo "   • Go to Settings → Linked Devices"
echo "   • Click on 'Link a Device'"
echo "   • Scan the QR code that appears"
echo ""
echo "4. Test the bot:"
echo "   • Visit the website"
echo "   • Pair your number"
echo "   • Send commands via WhatsApp"
echo ""
echo -e "${BLUE}📁 Project Structure:${NC}"
ls -la
echo ""
echo -e "${BLUE}🛠️  Available Commands:${NC}"
echo "npm start    - Start the bot"
echo "npm run dev  - Start with nodemon (development)"
echo "npm run setup - Run this setup script again"
echo ""
echo -e "${YELLOW}⚠ Note: First run will take time as WhatsApp Web loads${NC}"
echo -e "${GREEN}========================================${NC}"