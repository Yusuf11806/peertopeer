# Peer2Peer Vercel deployment

This folder contains the static Browser-Only version of Peer2Peer and is ready to deploy on Vercel.

## Deploy from this repository

1. Import the repository into Vercel.
2. Set **Root Directory** to `Peer2Peer-Vercel-Ready`.
3. Leave the framework as **Other** and leave the build command and output directory empty.
4. Deploy.

## Deploy this folder as its own repository

Upload the contents of this folder to a GitHub repository, then import that repository into Vercel. Keep `index.html`, `script.js`, `style.css`, and `vercel.json` together at the repository root.

This version stores accounts, profiles, mentor data, updates, and chats in each visitor's browser storage. It does not share data between users or devices, and it does not require environment variables or a database.
