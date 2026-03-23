const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

io.on('connection', (socket) => {
    console.log('Oyuncu bağlandı:', socket.id);

    // Oda oluştur veya katıl
    socket.on('joinRoom', (data) => {
        const roomCode = data.code;
        const difficulty = data.difficulty;

        if (!rooms[roomCode]) {
            rooms[roomCode] = {
                players: {},
                wave: 1,
                money: 0,
                gameStarted: false,
                difficulty: difficulty || 'easy'
            };
        }

        const room = rooms[roomCode];
        const playerCount = Object.keys(room.players).length;

        if (playerCount >= 2) { socket.emit('roomFull'); return; }

        socket.join(roomCode);
        socket.roomCode = roomCode;

        const playerNum = playerCount + 1;
        room.players[socket.id] = {
            id: socket.id, num: playerNum,
            x: playerNum === 1 ? 300 : 600, y: 250,
            hp: 100, maxHp: 100, weapon: 'normal', alive: true
        };

        const newCount = Object.keys(room.players).length;
        socket.emit('joined', { playerNum, roomCode, playerCount: newCount });
        socket.to(roomCode).emit('playerJoined', { playerCount: newCount });
    });

    // Oyunu başlat (sadece host)
    socket.on('startGame', (roomCode) => {
        const room = rooms[roomCode];
        if(!room) return;
        const playerCount = Object.keys(room.players).length;
        room.gameStarted = true;
        io.to(roomCode).emit('gameStart', { 
            twoPlayers: playerCount >= 2,
            difficulty: room.difficulty
        });
    });

    // Oyuncu hareketi
    socket.on('playerMove', (data) => {
        const room = rooms[socket.roomCode];
        if (!room || !room.players[socket.id]) return;
        room.players[socket.id].x = data.x;
        room.players[socket.id].y = data.y;
        room.players[socket.id].weapon = data.weapon;
        socket.to(socket.roomCode).emit('otherPlayerMove', {
            id: socket.id,
            x: data.x,
            y: data.y,
            weapon: data.weapon,
            angle: data.angle
        });
    });

    // Mermi ateşleme
    socket.on('shoot', (data) => {
        socket.to(socket.roomCode).emit('otherShoot', data);
    });

    // Düşman mermileri (yeşil boss, hybrid)
    socket.on('enemyBullets', (data) => {
        socket.to(socket.roomCode).emit('enemyBullets', data);
    });

    // Diğer oyuncuya hasar ver
    socket.on('damageOther', (dmg) => {
        socket.to(socket.roomCode).emit('takeDamage', dmg);
    });

    // Düşman durumu (sadece host yönetir)
    socket.on('enemyUpdate', (enemies) => {
        const room = rooms[socket.roomCode];
        if (!room) return;
        room.enemies = enemies;
        socket.to(socket.roomCode).emit('enemySync', enemies);
    });

    // Para güncelleme
    socket.on('moneyUpdate', (money) => {
        socket.to(socket.roomCode).emit('moneySync', money);
    });

    // Dalga güncelleme
    socket.on('waveUpdate', (wave) => {
        const room = rooms[socket.roomCode];
        if (!room) return;
        room.wave = wave;
        socket.to(socket.roomCode).emit('waveSync', wave);
    });

    // Can güncelleme
    socket.on('hpUpdate', (hp) => {
        const room = rooms[socket.roomCode];
        if (room && room.players[socket.id]) {
            room.players[socket.id].hp = hp;
            socket.to(socket.roomCode).emit('otherHpUpdate', { id: socket.id, hp });
        }
    });

    // Oyuncu öldü
    socket.on('playerDied', () => {
        const room = rooms[socket.roomCode];
        if (room && room.players[socket.id]) {
            room.players[socket.id].alive = false;
            // İkisi de öldüyse game over
            const allDead = Object.values(room.players).every(p => !p.alive);
            if (allDead) {
                io.to(socket.roomCode).emit('gameOver');
            }
        }
    });

    // Bağlantı kesildi
    socket.on('disconnect', () => {
        console.log('Oyuncu ayrıldı:', socket.id);
        const room = rooms[socket.roomCode];
        if (room) {
            delete room.players[socket.id];
            socket.to(socket.roomCode).emit('otherPlayerLeft');
            if (Object.keys(room.players).length === 0) {
                delete rooms[socket.roomCode];
            }
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
