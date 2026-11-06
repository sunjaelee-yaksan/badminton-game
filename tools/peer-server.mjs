// 자체 연결 서버(시험·학교 내부망용). 실행: npm run peer-server → http://localhost:9000
// 게임 주소 뒤에 ?peerhost=localhost&peerport=9000 을 붙이면 공개 서버 대신 이 서버를 사용
import express from 'express';
import http from 'node:http';
import { ExpressPeerServer } from 'peer';

const port = Number(process.env.PORT || 9000);
const app = express();
const server = http.createServer(app);
app.use('/', ExpressPeerServer(server, { path: '/', allow_discovery: false }));
server.listen(port, '0.0.0.0', () => console.log(`PeerJS 연결 서버 실행 중: http://localhost:${port}`));
