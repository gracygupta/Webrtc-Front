// RoomContext.js
import React, { createContext, useState, useContext } from "react";

const RoomContext = createContext();

export const useRoom = () => useContext(RoomContext);

export const RoomProvider = ({ children }) => {
  const [roomName, setRoomName] = useState(null);

  return (
    <RoomContext.Provider value={{ roomName, setRoomName }}>
      {children}
    </RoomContext.Provider>
  );
};
