# Miri-wishlist

A beautiful gift wishlist website for Mirinae, allowing family and friends to view and mark items as purchased.

## Features

- ✨ Add gift items with product links (Amazon, Target, etc.) or experiences
- 🔢 Quantity tracking - items count down as people buy them
- ✅ Purchase marking - click "I'll Buy This!" to mark items
- 🎨 Beautiful, responsive design that works on all devices
- 📱 Mobile-friendly interface
- 🔗 Public sharing capability

## Tech Stack

- **Frontend**: React 18
- **Backend**: Node.js + Express
- **Database**: SQLite (better-sqlite3)
- **Styling**: Custom CSS with gradient theme

## Local Development

### Prerequisites

- Node.js 16+ and npm

### Installation

1. Install all dependencies:
```bash
npm run install-all
```

2. Start the development server:
```bash
npm run dev
```

This will start:
- Backend API on `http://localhost:3001`
- React frontend on `http://localhost:3000`

### Production Build

```bash
# Build the React app
npm run build

# Start the production server
NODE_ENV=production npm start
```

## API Endpoints

- `GET /api/items` - Get all wishlist items
- `POST /api/items` - Add a new item
- `POST /api/items/:id/purchase` - Mark one unit as purchased (decreases quantity)
- `PATCH /api/items/:id/quantity` - Update item quantity
- `DELETE /api/items/:id` - Delete an item

## AWS EC2 Deployment Guide

### Step 1: Launch EC2 Instance

1. Log in to AWS Console and navigate to EC2
2. Click "Launch Instance"
3. Choose **Amazon Linux 2023** or **Ubuntu 22.04 LTS**
4. Select instance type: **t2.micro** (free tier eligible)
5. Create or select a key pair for SSH access
6. Configure Security Group:
   - **SSH (22)**: Your IP address
   - **HTTP (80)**: 0.0.0.0/0 (Anywhere)
   - **Custom TCP (3001)**: 0.0.0.0/0 (or use HTTPS/443 if setting up SSL)
7. Launch the instance

### Step 2: Connect to Your EC2 Instance

```bash
ssh -i your-key.pem ec2-user@your-ec2-public-ip
```

### Step 3: Install Node.js

For Amazon Linux 2023:
```bash
sudo yum update -y
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
```

For Ubuntu:
```bash
sudo apt update
sudo apt install nodejs npm -y
```

### Step 4: Install Git and Clone Repository

```bash
sudo yum install git -y  # Amazon Linux
# OR
sudo apt install git -y  # Ubuntu

# Clone your repository
git clone <your-repo-url>
cd Miri-wishlist
```

### Step 5: Install Dependencies and Build

```bash
npm install
cd client && npm install && npm run build
cd ..
```

### Step 6: Install PM2 (Process Manager)

```bash
npm install -g pm2
```

### Step 7: Start the Application

```bash
NODE_ENV=production PORT=3001 pm2 start server/index.js --name miri-wishlist
pm2 save
pm2 startup
```

### Step 8: Configure Nginx (Optional but Recommended)

Install Nginx:
```bash
sudo yum install nginx -y  # Amazon Linux
# OR
sudo apt install nginx -y  # Ubuntu

sudo systemctl start nginx
sudo systemctl enable nginx
```

Create Nginx configuration:
```bash
sudo nano /etc/nginx/conf.d/wishlist.conf
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # or use EC2 public IP

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Restart Nginx:
```bash
sudo systemctl restart nginx
```

### Step 9: Access Your Website

Your wishlist will be available at:
- Direct: `http://your-ec2-public-ip:3001`
- With Nginx: `http://your-ec2-public-ip` or `http://your-domain.com`

### Step 10: Set Up a Custom Domain (Optional)

1. Register a domain (e.g., GoDaddy, Namecheap)
2. In your domain's DNS settings, create an A record:
   - Type: A
   - Name: @ (or subdomain like `mirinae`)
   - Value: Your EC2 public IP
3. Wait for DNS propagation (5-30 minutes)

### Step 11: Enable HTTPS with Let's Encrypt (Recommended)

```bash
sudo yum install certbot python3-certbot-nginx -y  # Amazon Linux
# OR
sudo apt install certbot python3-certbot-nginx -y  # Ubuntu

sudo certbot --nginx -d your-domain.com
```

## Managing the Application

### View logs:
```bash
pm2 logs miri-wishlist
```

### Restart application:
```bash
pm2 restart miri-wishlist
```

### Update application:
```bash
git pull
npm install
cd client && npm install && npm run build
cd ..
pm2 restart miri-wishlist
```

## Database Backup

The SQLite database is stored in `wishlist.db`. To backup:

```bash
# On EC2
cp wishlist.db wishlist-backup-$(date +%Y%m%d).db

# Download to local machine
scp -i your-key.pem ec2-user@your-ec2-ip:~/Miri-wishlist/wishlist.db ./backup/
```

## Cost Estimation

- **EC2 t2.micro**: Free tier eligible (750 hours/month free for 12 months)
- **After free tier**: ~$8-10/month
- **Data transfer**: First 1 GB free, then $0.09/GB
- **Domain**: $10-15/year (optional)

## Security Recommendations

1. Keep your instance updated: `sudo yum update -y`
2. Use SSH keys instead of passwords
3. Configure AWS Security Groups properly
4. Enable HTTPS with Let's Encrypt
5. Regular database backups
6. Consider using AWS RDS for production database

## Support

For issues or questions, please create an issue in the GitHub repository.

## License

MIT
