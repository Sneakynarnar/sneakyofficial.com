
---

# 🎯 sneakyofficial.com

The source code for [**sneakyofficial.com**](https://sneakyofficial.com) — a personal portfolio, Splatoon weapon scraper, and full-stack showcase all rolled into one. Built by **Nana Adjei** (that’s me, hi 👋), this repo features a sleek React frontend, an async Python backend, and some delicious scraping sauce on the side.

---

## 🧠 Tech Stack

### 🌐 Frontend (`src/frontend`)

* **React 18**
* **TypeScript + Vite**
* **Tailwind CSS** (fully dripped)
* **React Router**
* Some 3D ✨ with `@react-three/fiber` + cool animated components
* Built assets live in `dist/`, deployed via `nginx`

### 🧪 Backend (`src/backend`)

* **Python 3.10**
* **aiohttp** for async web server + REST API
* **OAuth2** (Discord integration)
* Custom scraper tools: `splatscraper.py`, `splatweightscraper.py`, etc.
* Simple SQLite + context manager for DB operations

---

## 🚀 Project Features

* ⚡ Live-rendered portfolio with animated sections
* 🎮 Splatdle — a custom Wordle-style game based on Splatoon weapons
* 🔐 OAuth2 login with Discord
* 📦 REST API built from scratch using `aiohttp`
* 🧽 Web scrapers to keep weapon data fresh
* 📂 Clean separation between frontend, backend, and data resources

---

## 🛠 Setup Instructions

### 🔁 Clone the Repo

```bash
git clone https://github.com/yourusername/sneakyofficial.com.git
cd sneakyofficial.com
```

---

### 🖼️ Frontend

```bash
cd src/frontend
npm install
npm run dev     # Starts Vite dev server on localhost
```

#### Build for production

```bash
npm run build   # Outputs to dist/
```

---

### 🧠 Backend

```bash
cd src/
python3.10 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

pip install -r requirements.txt
python main.py
```

> This will start the `aiohttp` server on port `8080`.
> Your API will now serve `/api/splatdle` etc.

---

## 🗂 Directory Tree (important bits only)

```bash
.
├── src
│   ├── frontend                # React app
│   │   ├── app                 # Components, hooks, pages
│   │   └── dist                # Built assets
│   └── backend
│       ├── website            # aiohttp handlers, routes, Discord OAuth
│       ├── bot                # Game logic (e.g. Splatdle)
│       └── resources          # weapons.json, .txt files
├── splatscraper.py            # Scrapes Splatoon data into JSON
├── splatweightscraper.py      # Gets weight class info
├── build_react.sh             # Build helper script
├── requirements.txt
└── README.md
```

---

## 🧼 Scripts You Might Care About

```bash
# Build frontend (and copy to backend)
./build_react.sh

make sure to chmod +x that bad boy

# Run scraper manually
python splatscraper.py

# Fixes keys in weapon data
python splatkeyfixer.py
```

---

## 📦 Example API Response

```json
{
  "name": "Splattershot (Splatoon 3)",
  "class": "Shooter",
  "range": 60,
  "damage": 47,
  "special": "Trizooka"
}
```

---

## 🌍 Deployed With

* **Nginx** (static + reverse proxy)
* **Let's Encrypt** via Certbot (HTTPS, free SSL 😎)
* **Ubuntu VPS**, manually configured

---

## 📬 Contact Me

Wanna collab? Got feedback? Found a bug that’s breaking Splatdle and hurting your soul?

* Discord: `sneakynarnar`
* Email: [nanaadjei6981@gmail.com](mailto:contact@nanaadjei6981@gmail.com)
* Or visit: [**sneakyofficial.com**](https://sneakyofficial.com/socials) to see my socials

---

### 🧃 Bonus

> “Stay fresh.” – Callie & Marie (probably also about code hygiene)

