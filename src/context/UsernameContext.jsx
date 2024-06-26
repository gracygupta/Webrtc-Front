// UsernameContext.js
import React, { createContext, useState, useContext } from "react";

const UserContext = createContext();

export const useUsername = () => useContext(UserContext);

export const UserProvider = ({ children }) => {
  const [username, setUsername] = useState(null);

  return (
    <UserContext.Provider value={{ username, setUsername }}>
      {children}
    </UserContext.Provider>
  );
};
