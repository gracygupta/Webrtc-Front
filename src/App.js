import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LobbyScreen from "./screens/Lobby";
import VideoChatApp from "./screens/Mediasoup";
import { RoomProvider } from "./context/RoomContext";
import { UserProvider } from "./context/UsernameContext";

function App() {
  return (
    <RoomProvider>
      <UserProvider>
        <Router>
          <div className="App">
            <Routes>
              <Route path="/" element={<LobbyScreen />} />
              <Route path="/meeting/:roomId" element={<VideoChatApp />} />
            </Routes>
          </div>
        </Router>
      </UserProvider>
    </RoomProvider>
  );
}

export default App;
