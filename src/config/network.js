// 온라인(P2P) 설정
// 기본값은 PeerJS 무료 공개 연결 서버(0.peerjs.com)를 씁니다. 학생 기기끼리 처음 연결할 때만 이 서버를 거치고,
// 연결된 뒤 경기 데이터는 기기끼리 직접 오갑니다.
// 학교망에서 연결이 안 되면: ① 휴대폰 핫스팟으로 시험 ② 나중에 자체 연결 서버(tools/peer-server.mjs)를 띄워 아래 peer 값을 바꾸기
export const NETWORK = {
  idPrefix: 'badminton-class-v1-',  // 방 코드 앞에 붙는 고유 이름(다른 서비스와 겹치지 않게)
  codeLength: 4,
  maxPlayers: 4,
  snapshotHz: 30,                    // 방장이 초당 몇 번 화면 상태를 보내는가
  inputHz: 30,                       // 참가자가 초당 몇 번 이동 입력을 보내는가
  joinTimeoutMs: 9000,
  peer: {},                          // 비워두면 PeerJS 공개 서버. 예: { host: 'my-server.com', port: 443, path: '/peer', secure: true }
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

// 시험용: 주소 뒤에 ?peerhost=localhost&peerport=9000 을 붙이면 그 연결 서버를 사용
export function peerOptions() {
  const q = new URLSearchParams(location.search);
  const opts = { ...NETWORK.peer, config: { iceServers: NETWORK.iceServers }, debug: 1 };
  if (q.get('peerhost')) {
    opts.host = q.get('peerhost');
    opts.port = Number(q.get('peerport') || 9000);
    opts.path = q.get('peerpath') || '/';
    opts.secure = q.get('peersecure') === '1';
  }
  return opts;
}
