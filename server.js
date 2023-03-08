const express = require('express');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const twilio = require('twilio');



const PORT = process.env.PORT || 5000;

const app = express();

const server = http.createServer(app);

app.use(cors());


let connectedUsers = [];
let rooms = [];


app.get("/api/room-exists/:roomId", (req, res) => {
    const { roomId } = req.params;
    const room = rooms.find(r => r.id === roomId);

    if (room) {
        if (room.connectedUsers.length > 3) {
            return res.send({ roomExists: true, full: true })
        } else {
            return res.send({ roomExists: true, full: false })
        }
    } else {
        return res.send({ roomExists: false }).status(404);
    }
})

app.get("/api/get-turn-credentials", (req, res) => {
    const accSid = "ACa2c367ad1e339b7d7b8868620d056202";
    const auth_token = "9a0a393ee0ec4f1cdfe3953e616a9815";

    const client = twilio(accSid, auth_token);

    let resToken = null;
    try {
        client.tokens.create().then(token => {
            resToken = token;
            res.send({ token });
        })
    } catch (err) {
        console.log("error occured when fetching turn server");
        console.log(err.message);
        res.send({ token: null })
    }
})

const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

io.on("connection", (socket) => {
    console.log("user connected" + " " + socket.id)
    socket.on("create-new-room", (data) => {
        createNewRoomHandler(data, socket)
    })

    socket.on("join-room", (data) => {
        joinRoomHandler(data, socket)
    })

    socket.on("disconnect", () => {
        disconnectHandler(socket)
    })

    socket.on("conn-signal", data => {
        signalHandler(data, socket)
    })

    socket.on("conn-init", data => {
        console.log("conn-init", data)
        initConnectionHandler(data, socket)
    })


})

const createNewRoomHandler = (data, socket) => {
    const { identity, onlyAudio } = data;

    const roomId = uuidv4();

    const newUser = {
        identity,
        id: uuidv4(),
        socketId: socket.id,
        roomId,
        onlyAudio
    }
    connectedUsers = [...connectedUsers, newUser]

    const newRoom = {
        id: roomId,
        connectedUsers: [newUser]
    }

    socket.join(roomId)

    rooms = [...rooms, newRoom]

    socket.emit("room-id", { roomId })


    socket.emit("room-update", { connectedUsers: newRoom.connectedUsers })
}


const joinRoomHandler = (data, socket) => {
    const { identity, roomId, onlyAudio } = data;

    const newUser = {
        identity,
        id: uuidv4(),
        socketId: socket.id,
        roomId,
        onlyAudio
    }
    const room = rooms.find((r) => r.id === roomId)

    console.log(room, "found", roomId)
    // return
    room.connectedUsers = [...room.connectedUsers, newUser]


    socket.join(roomId);

    connectedUsers = [...connectedUsers, newUser]

    room.connectedUsers.forEach(user => {
        if (user.socketId !== socket.id) {
            const data = {
                connUserSocketId: socket.id
            }
            io.to(user.socketId).emit("conn-prepare", data)
        }
    })

    io.to(roomId).emit("room-update", { connectedUsers: room.connectedUsers })
}



const disconnectHandler = (socket) => {

    const user = connectedUsers.find(u => u.socketId === socket.id);

    // console.log(user, "userrrr")
    if (user) {
        const room = rooms.find(room => room.id === user.roomId)


        room.connectedUsers = room.connectedUsers.filter(user => user.socketId !== socket.id)

        socket.leave(user.roomId)

        if (room.connectedUsers.length > 0) {


            io.to(room.id).emit("user-disconnected", { socketId: socket.id })



            io.to(room.id).emit("room-update", {
                connectedUsers: room.connectedUsers,
            })
        } else {
            rooms = rooms.filter(r => r.id !== room.id)
        }
    }

}


const signalHandler = (data, socket) => {
    const { connUserSocketId, signal } = data;

    const signallingData = { signal, connUserSocketId: socket.id };

    io.to(connUserSocketId).emit("conn-signal", signallingData)
}

const initConnectionHandler = (data, socket) => {
    const { connUserSocketId } = data;

    const initData = { connUserSocketId: socket.id };

    io.to(connUserSocketId).emit("conn-init", initData)


}


server.listen(PORT, () => {
    console.log("Sever is listening on port " + PORT)
});