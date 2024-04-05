import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useRoom } from "../context/RoomContext";
import { useUsername } from "../context/UsernameContext";
import axios from "axios";
import "../css/Lobby.css";
import {
  SERVER_LOCALHOST,
  SERVER_DEPLOYMENT,
  CLIENT_DEPLOYMENT,
  CLIENT_LOCALHOST,
} from "../helper/constants";

const LobbyScreen = () => {
  const navigate = useNavigate();
  const { roomName, setRoomName } = useRoom("");
  const { username, setUsername } = useUsername("");

  useEffect(() => {
    const fetchRoomId = async () => {
      try {
        const response = await axios.get(`${SERVER_DEPLOYMENT}/api/front/meet`);
        const { roomId } = response.data.data;
        setRoomName(roomId);
      } catch (error) {
        console.error(
          JSON.stringify({ message: "Error fetching room ID:", error: error })
        );
      }
    };
    if (!roomName) {
      fetchRoomId();
    }
    setUsername(username);
  }, []);

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    try {
      const meetingLink = `${CLIENT_LOCALHOST}/meeting/${roomName}`;
      navigator.clipboard.writeText(meetingLink);
      setUsername(username);
      localStorage.setItem("roomName", roomName);
      localStorage.setItem("username", username);
      alert("Meeting link copied to clipboard.");
      navigate(`/meeting/${roomName}`);
    } catch (error) {
      console.error("Error creating room:", error);
    }
  };

  return (
    <form id="msform" onSubmit={handleCreateRoom}>
      <ul id="progressbar">
        <li className="active">Create Meeting</li>
        <li>Share Link</li>
        <li>Connect</li>
      </ul>
      <fieldset>
        <h2 className="fs-title">Welcome to Lobby!</h2>
        <h3 className="fs-subtitle">Create your own room</h3>
        <input
          type="text"
          name="username"
          placeholder="Enter your Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="text"
          name="roomName"
          placeholder="Enter the Room Id"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
        />
        <input
          type="submit"
          name="Create Meeting"
          className="next action-button"
          value="Create"
        />
      </fieldset>
    </form>
  );
};

export default LobbyScreen;
