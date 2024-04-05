import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import { CiMicrophoneOn, CiMicrophoneOff } from "react-icons/ci";
import { VscUnmute } from "react-icons/vsc";
import {
  BsFillCameraVideoOffFill,
  BsFillCameraVideoFill,
} from "react-icons/bs";
import { FaTv } from "react-icons/fa";
import { MdOutlineTvOff } from "react-icons/md";
import { useNavigate, useParams } from "react-router-dom";
import { useRoom } from "../context/RoomContext";
import { useUsername } from "../context/UsernameContext";
import { params } from "../helper/constants";
import { SERVER_LOCALHOST, SERVER_DEPLOYMENT } from "../helper/constants";
import ScreenSharing from "./ScreenSharing";
const mediasoupClient = require("mediasoup-client");

export let device;
const VideoChatApp = () => {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const [socket, setSocket] = useState(null);
  const { username, setUsername } = useUsername("");
  const { roomName, setRoomName } = useRoom("");
  let peerVideo = document.getElementById("peer-video");
  const [peerVideoStream, setPeerVideoStream] = useState(null);
  const [peerVideo2Stream, setPeerVideo2Stream] = useState(null);
  const peerVideoRef = useRef(null);
  const peerVideo2Ref = useRef(null);
  const localVideo = document.getElementById("localVideo");
  const localScreen = document.getElementById("localScreen");
  const videoContainer = document.getElementById("videoContainer");
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [screenShared, setScreenShared] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const [screenDevice, setScreenDevice] = useState();
  // const [device, setDevice] = useState();
  // const [rtpCapabilities, setRtpCapabilities] = useState();
  useEffect(() => {
    // const newSocket = io(`${SERVER_DEPLOYMENT}`);
    const newSocket = io(`${SERVER_LOCALHOST}`);
    // const newSocket = io("https://video.api.blockverse.tech");
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  let rtpCapabilities;
  let rtpScreenCapabilities;
  let producerTransport;
  let producerScreenTransport;
  let consumerTransports = [];
  let audioProducer;
  let videoProducer;
  let audioProducerScreen;
  let videoProducerScreen;
  let consumer;
  let isProducer = false;

  let audioParams;
  let videoParams = { params };
  let audioParamsScreen;
  let videoParamsScreen = { params };
  let videoScreenParams = { params };
  let consumingTransports = [];
  let screenSharedStream;
  let screensharedUser = false;
  let remoteProducerId;
  let producersInRoom = {}; //{ producer1: username1 ....}
  const getLocalStream = () => {
    navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: {
          width: {
            min: 640,
            max: 1920,
          },
          height: {
            min: 400,
            max: 1080,
          },
        },
      })
      .then(streamSuccess)
      .catch((error) => {
        console.log(error.message);
      });
  };

  //  screen sharing
  const streamSuccess = (stream) => {
    localVideo.srcObject = stream;
    audioParams = { track: stream.getAudioTracks()[0], ...audioParams };
    videoParams = { track: stream.getVideoTracks()[0], ...videoParams };

    if (screensharedUser) {
      audioParamsScreen = {
        track: screenSharedStream.getAudioTracks()[0],
        ...audioParamsScreen,
      };
      videoParamsScreen = {
        track: screenSharedStream.getVideoTracks()[0],
        ...videoParamsScreen,
      };
    }
    joinRoom();
  };

  const joinRoom = () => {
    socket.emit("joinRoom", { roomName, userName: username }, (data) => {
      // we assign to local variable and will be used when
      // loading the client Device (see createDevice above)
      rtpCapabilities = data.rtpCapabilities;
      // once we have rtpCapabilities from the Router, create Device

      console.log(
        JSON.stringify({
          message: `Joined room`,
          room: `${roomName}`,
          username: `${username}`,
          location: `joinRoom`,
        })
      );

      createDevice();
    });
  };

  // A device is an endpoint connecting to a Router on the server side to send/receive media
  const createDevice = async () => {
    try {
      device = new mediasoupClient.Device();

      // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-load
      // Loads the device with RTP capabilities of the Router (server side)
      await device.load({
        // see getRtpCapabilities() below
        routerRtpCapabilities: rtpCapabilities,
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:13.232.15.21:3478" },
          {
            urls: "turn:13.232.15.21:3478",
            username: "test",
            credential: "testing",
          },
        ],
      });
      console.log({
        message: "Device created successfully",
        device: device,
        location: "createDevice",
      });
      // once the device loads, create transport
      createSendTransport();
    } catch (error) {
      console.error({
        message: "Error creating device",
        error: error.toString(),
        location: "createDevice",
      });

      if (error.name === "UnsupportedError") {
        console.warn({
          message: "Browser not supported",
          location: "createDevice",
        });
      }
    }
  };

  const createSendTransport = () => {
    // Emit request to server to create WebRTC transport
    // This is called from Producer, so sender = true
    socket.emit("createWebRtcTransport", { consumer: false }, ({ params }) => {
      console.log(
        JSON.stringify({
          message: `Received server parameters`,
          params: params,
          location: "createSendTransport",
        })
      );

      // Handle error if params contain an error
      if (params && params.error) {
        console.log(
          JSON.stringify({
            message: `Error returned by server`,
            error: params.error,
            location: "createSendTransport",
          })
        );
        return;
      }

      // Create new WebRTC Transport to send media based on server's params
      producerTransport = device.createSendTransport(params);

      // Event raised when first call to transport.produce() is made
      producerTransport.on(
        "connect",
        async ({ dtlsParameters }, callback, errback) => {
          try {
            // Signal local DTLS parameters to the server side transport
            await socket.emit("transport-connect", {
              dtlsParameters,
            });
            console.log(
              JSON.stringify({
                message: "WebRTC Transport Created and Connected",
                dtlsParameters,
                location: "createSendTransport",
              })
            );
            // Tell the transport that parameters were transmitted.
            callback();
          } catch (error) {
            errback(error);
          }
        }
      );

      // Event raised when transport produces media
      producerTransport.on("produce", async (parameters, callback, errback) => {
        try {
          // Tell the server to create a Producer with the following parameters
          // and expect back a server side producer id
          await socket.emit(
            "transport-produce",
            {
              kind: parameters.kind,
              rtpParameters: parameters.rtpParameters,
              appData: parameters.appData,
            },
            ({ id, producersExist }) => {
              // Log successful transport produce event
              console.log(
                JSON.stringify({
                  message: "Transport Produced Successfully",
                  producerParameters: parameters,
                  serverProducerId: id ? `Server side producer id ${id}` : null,
                  location: "createSendTransport",
                })
              );
              // Tell the transport that parameters were transmitted and provide it with the
              // server side producer's id.
              callback({ id });

              // If producers exist, then join room
              if (producersExist) {
                getProducers();
                getPeers();
              }
            }
          );
        } catch (error) {
          console.log(
            JSON.stringify({
              message: "Error occurred during transport produce",
              error,
              location: "createSendTransport",
            })
          );
          errback(error);
        }
      });

      // Call connectSendTransport after creating send transport
      connectSendTransport();
    });
  };

  const getSharedStream = () => {
    console.log(
      JSON.stringify({
        message: "Screen Shared",
        location: "getSharedStream",
      })
    );
    navigator.mediaDevices
      .getDisplayMedia({ video: true, audio: true })
      .then((stream) => (screenSharedStream = stream))
      .catch((error) => {
        console.log(
          JSON.stringify({
            message: "Error in Screen Sharing",
            error: error.message,
            location: "getSharedStream",
          })
        );
      });
  };

  const connectSendTransport = async () => {
    // Instruct the producer transport to send media to the Router
    // This action will trigger the 'connect' and 'produce' events above
    // More info: https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce

    try {
      audioProducer = await producerTransport.produce(audioParams);
      videoProducer = await producerTransport.produce(videoParams);

      // Check if screensharing is enabled for a user
      if (screensharedUser) {
        audioProducerScreen = await producerTransport.produce(
          audioParamsScreen
        );
        videoProducerScreen = await producerTransport.produce(
          videoParamsScreen
        );
      }

      // Handle events for audioProducer
      audioProducer.on("trackended", () => {
        console.log(
          JSON.stringify({
            message: "Audio track ended",
            location: "connectSendTransport",
          })
        );
        // Additional logic to handle track ending
      });

      audioProducer.on("transportclose", () => {
        console.log(
          JSON.stringify({
            message: "Audio transport closed",
            location: "connectSendTransport",
          })
        );
        // Additional logic to handle transport closing
      });

      // Handle events for videoProducer
      videoProducer.on("trackended", () => {
        console.log(
          JSON.stringify({
            message: "Video track ended",
            location: "connectSendTransport",
          })
        );
        // Additional logic to handle track ending
      });

      videoProducer.on("transportclose", () => {
        console.log(
          JSON.stringify({
            message: "Video transport closed",
            location: "connectSendTransport",
          })
        );
        // Additional logic to handle transport closing
      });
    } catch (error) {
      console.error("Error connecting send transport:", error);
      // Additional error handling if needed
    }
  };

  let rtpParameter;
  let screenRtpParameters;

  const getProducers = () => {
    console.log("Requesting producer IDs from server...");

    socket.emit("getProducers", (producerIds) => {
      if (!producerIds || producerIds.length === 0) {
        console.log("No producer IDs received or the list is empty.");
        return;
      }
      // for (const socketId in peers) {
      //   const peer = peers[socketId];
      //   const { username, producers } = peer;

      //   producers.forEach((producerId) => {
      //     producersInRoom[producerId] = username;
      //   });
      // }
      console.log("Inside getProducers ---> producersInRoom:", producersInRoom);
      console.log(
        `Received producer IDs: ${producerIds.join(
          ", "
        )}. Creating consumer transports.`
      );

      // For each of the producer, create a consumer
      producerIds.forEach((id) => {
        signalNewConsumerTransport(id);
      });

      console.log("All consumer transports initiated.");
    });
  };

  const getPeers = () => {
    console.log("Requesting peers from server...");

    socket.emit("getPeers", (producerUserMap) => {
      console.log("peers: ", producerUserMap);
      producersInRoom = producerUserMap;
    });
  };

  const signalNewConsumerTransport = async (
    remoteProducerId,
    remoteProducerUserName
  ) => {
    producersInRoom[remoteProducerId] = remoteProducerUserName;
    console.log("producersInRoom", producersInRoom);
    remoteProducerId = remoteProducerId;
    // Check if we are already consuming the remoteProducerId
    if (consumingTransports.includes(remoteProducerId)) {
      console.log(`Already consuming transport for: ${remoteProducerId}`);
      return;
    }
    consumingTransports.push(remoteProducerId);
    // The server sends back params needed
    // to create Send Transport on the client side
    await socket.emit(
      "createWebRtcTransport",
      { consumer: true },
      async ({ params }) => {
        if (params) {
          console.log(
            `Server returned with params for ${remoteProducerId}`,
            params
          );
        }

        if (params.error) {
          console.error("Error returning params from server:", params.error);
          return;
        }

        let consumerTransport;
        try {
          consumerTransport = device.createRecvTransport(params);
        } catch (error) {
          console.error("Error creating consumer transport", error);
          return;
        }
        // Signal local DTLS parameters to the server side transport
        // see server's socket.on('transport-recv-connect', ...)
        consumerTransport.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
            try {
              // Signal local DTLS parameters to the server side transport
              await socket.emit("transport-recv-connect", {
                dtlsParameters,
                serverConsumerTransportId: params.id,
              });

              console.log(
                `DTLS parameters transmitted for ${remoteProducerId}`
              );

              // Tell the transport that parameters were transmitted successfully
              callback();
            } catch (error) {
              console.error("Error during DTLS parameter transmission", error);
              // Tell the transport that something was wrong
              errback(error);
            }
          }
        );

        // This function establishes connection and setup receiving transport
        connectRecvTransport(consumerTransport, remoteProducerId, params.id);
      }
    );
  };

  const connectRecvTransport = async (
    consumerTransport,
    remoteProducerId,
    serverConsumerTransportId
  ) => {
    console.log(
      `Attempting to connect and consume: remoteProducerId=${remoteProducerId}, serverConsumerTransportId=${serverConsumerTransportId}`,
      { location: "connectRecvTransport" }
    );

    // For consumer, we need to tell the server first
    // to create a consumer based on the rtpCapabilities and consume
    // if the router can consume, it will send back a set of params as below
    await socket.emit(
      "consume",
      {
        rtpCapabilities: device?.rtpCapabilities,
        remoteProducerId,
        serverConsumerTransportId,
      },
      async ({ params }) => {
        if (params.error) {
          console.error(`Error consuming: ${params.error}`, {
            location: "connectRecvTransport",
          });
          return;
        }

        console.log(`Consumer Params: ${JSON.stringify(params)}`, {
          location: "connectRecvTransport",
        });

        // Then consume with the local consumer transport
        // which creates a consumer
        const consumer = await consumerTransport.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
        });

        consumerTransports.push({
          consumerTransport,
          serverConsumerTransportId: params.id,
          producerId: remoteProducerId,
          consumer,
        });
        console.log("consumerTransports", consumerTransports);

        console.log(`Consumer created for producerId=${remoteProducerId}`, {
          location: "connectRecvTransport",
        });

        // Add event listeners for transport-connect and track events
        consumerTransport.on("connect", async () => {
          console.log("Consumer transport connected");
        });

        // Create a new div element for the new consumer media
        const container = document.createElement("div");
        container.id = `container-${remoteProducerId}`;
        Object.assign(container.style, {
          border: "4px solid green",
          "background-color": "grey",
          borderRadius: "10px",
        });
        container.classList.add("video-container");
        let videoElement;
        if (params.kind === "audio") {
          console.log("Appending audio element.");
          const audioElement = document.createElement("audio");
          audioElement.id = `audio-${remoteProducerId}`;
          audioElement.autoplay = true;
          container.style.display = "none";
          container.appendChild(audioElement);
        } else {
          console.log("Appending video element.");
          videoElement = document.createElement("video");
          videoElement.id = `video-${remoteProducerId}`;
          videoElement.autoplay = true;
          videoElement.className = "video";
          container.appendChild(videoElement);
        }
        const usernameParagraph = document.createElement("p");
        usernameParagraph.textContent = `Username: ${producersInRoom[remoteProducerId]}`;
        container.appendChild(usernameParagraph);

        videoContainer.appendChild(container);

        const { track } = consumer;
        if (track && !track.muted && track.readyState === "live") {
          console.log(
            `Adding live track to the DOM for producerId=${remoteProducerId}`
          );

          if (videoElement) {
            videoElement.srcObject = new MediaStream([track]);
            console.log("videoElement", videoElement);
            console.log("track added");
            Object.assign(videoElement.style, {
              height: "300px",
              width: "100%",
            });
            videoElement.addEventListener("loadedmetadata", () => {
              videoElement
                .play()
                .then(() => {
                  console.log("The video track is played.");
                })
                .catch((error) => {
                  console.error("Failed to start playback:", error);
                });
            });
          }
        } else {
          console.log("Video track is not actively being shared or is muted.");
        }

        // The server consumer started with media paused
        // so we need to inform the server to resume
        socket.emit("consumer-resume", {
          serverConsumerId: params.serverConsumerId,
        });
      }
    );
  };

  useEffect(() => {
    setRoomName(roomId);
    if (!localStorage.getItem("username")) {
      navigate("/");
    } else {
      if (socket) {
        socket.on("connection-success", ({ socketId }) => {
          getLocalStream();
        });

        socket.on("producer-closed", ({ remoteProducerId }) => {
          // server notification is received when a producer is closed
          // we need to close the client-side consumer and associated transport
          const producerToClose = consumerTransports.find(
            (transportData) => transportData.producerId === remoteProducerId
          );
          producerToClose.consumerTransport.close();
          producerToClose.consumer.close();

          // remove the consumer transport from the list
          consumerTransports = consumerTransports.filter(
            (transportData) => transportData.producerId !== remoteProducerId
          );

          // remove the video div element
          videoContainer.removeChild(
            document.getElementById(`container-${remoteProducerId}`)
          );
        });

        // server informs the client of a new producer just joined
        socket.on("new-producer", ({ producerId, remoteProducerUserName }) =>
          signalNewConsumerTransport(producerId, remoteProducerUserName)
        );

        // Receive and display the screen sharing stream
        socket.on("screenStream", (screenStream) => {
          // Display the screen sharing stream alongside camera and audio streams
        });

        return () => {};
      }
    }
  }, [socket, videoMuted]);

  // Mute/unmute audio
  const toggleAudio = () => {
    setAudioMuted(!audioMuted);
    socket.emit("mic-on-off", {
      isMic: !audioMuted,
    });
  };

  // Mute/unmute video
  const toggleVideo = () => {
    setVideoMuted(!videoMuted);

    if (localVideo.srcObject) {
      const videoTracks = localVideo.srcObject.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks[0].enabled = videoMuted;
      }
    }

    socket.emit("video-on-off", {
      isCamera: !videoMuted,
    });
  };

  useEffect(() => {
    if (screenStream) {
      // Check if screenStream is not null
      console.log("Updated ScreenShared: ", screenShared);
      console.log("Updated ScreenStream:", screenStream);

      // Emit the screen stream to the server (no JSON.stringify)
      socket.emit("startScreenSharing", {
        screenStream: screenStream, // Send the MediaStream object directly
        userName: "gracy",
      });
    }
  }, [screenShared, screenStream]);

  return (
    <div id="video">
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-around",
            padding: "25px",
          }}
        >
          <button onClick={toggleAudio}>
            {audioMuted ? (
              <CiMicrophoneOff
                style={{ fontSize: "70px", color: "red", cursor: "pointer" }}
              ></CiMicrophoneOff>
            ) : (
              <CiMicrophoneOn
                style={{ fontSize: "70px", cursor: "pointer" }}
              ></CiMicrophoneOn>
            )}
          </button>
          <ScreenSharing
            socket={socket}
            roomName={roomName}
            device={device}
            rtpCapabilities={rtpCapabilities}
            remoteProducerId={remoteProducerId}
            consumerTransports={consumerTransports}
          />
          <button onClick={toggleVideo}>
            {videoMuted ? (
              <BsFillCameraVideoOffFill
                style={{ fontSize: "70px", color: "red", cursor: "pointer" }}
              ></BsFillCameraVideoOffFill>
            ) : (
              <BsFillCameraVideoFill
                style={{ fontSize: "70px", cursor: "pointer" }}
              ></BsFillCameraVideoFill>
            )}
          </button>
        </div>
      </div>
      <table className="mainTable">
        <tbody>
          <tr>
            <td>
              <video
                width="500"
                height="500"
                id="localScreen"
                autoPlay
                className="videoScreen"
                muted
              ></video>
            </td>
            <td className="localColumn">
              <div
                className="localMedia"
                style={{
                  border: "7px solid black",
                  "background-color": "black",
                  borderRadius: "10px",
                }}
              >
                <video
                  height="300"
                  id="localVideo"
                  autoPlay
                  className="video"
                  muted
                ></video>
                <p style={{ color: "white" }}>Username: {username}</p>
              </div>
            </td>
            <td className="remoteColumn">
              <div
                id="videoContainer"
                style={{ display: "grid", gridTemplateColumns: "5" }}
              ></div>
            </td>
          </tr>
        </tbody>
      </table>
      <table>
        <tbody>
          <tr>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default VideoChatApp;
