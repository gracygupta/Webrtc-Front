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
  const [mediaStreams, setMediaStreams] = useState([]);

  const connectRecvTransport = async (
    consumerTransport,
    remoteProducerId,
    serverConsumerTransportId
  ) => {
    console.log(
      `Attempting to connect and consume: remoteProducerId=${remoteProducerId}, serverConsumerTransportId=${serverConsumerTransportId}`,
      { location: "connectRecvTransport" }
    );

    // Emit 'consume' to initiate consuming process
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
        console.log("peersDetails", params.peersDetails);

        // Consume the media
        const consumer = await consumerTransport.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
        });

        console.log("consumer...", consumer);

        // Add consumer to local management array
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

        consumerTransport.on("connect", async () => {
          console.log("Consumer transport connected");
        });

        // Create new elements for audio or video
        const mediaElement = document.createElement(
          params.kind === "audio" ? "audio" : "video"
        );
        mediaElement.id =
          params.kind === "audio"
            ? `audio-${remoteProducerId}`
            : `video-${remoteProducerId}`;
        mediaElement.autoplay = true;
        mediaElement.classList.add(params.kind === "audio" ? "audio" : "video");

        // Peer container setup
        const peerContainer = document.createElement("div");
        peerContainer.id = `peer-${remoteProducerId}`;
        peerContainer.classList.add(
          "flex",
          "flex-col",
          "items-center",
          "justify-center",
          "p-4"
        );
        Object.assign(peerContainer.style, {
          // display: "grid",
          border: "7px solid green",
          borderRadius: "10px",
          gridTemplateColumns: "auto auto auto auto",
          gridGap: "10px",
          backgroundColor: "transparent",
          padding: "10px",
          width: "30vw",
        });

        // Adding peer name
        const peerName = document.createElement("p");
        peerName.textContent = producersInRoom[remoteProducerId]
          ? producersInRoom[remoteProducerId]
          : `Peer-${remoteProducerId}`;

        if (params.kind === "audio") {
          peerContainer.style.display = "none";
        }
        peerContainer.appendChild(mediaElement);
        peerContainer.appendChild(peerName);

        // Append peer container to the main video container
        videoContainer.appendChild(peerContainer);

        // Handling the media track
        const { track } = consumer;
        console.log("track  --->", track);
        console.log("track muted --->", track.id, " ", track.muted);
        if (track && track.readyState === "live") {
          console.log(
            `Adding live track to the DOM for producerId=${remoteProducerId}`
          );
          mediaElement.srcObject = new MediaStream([track]);
          // mediaElement.style.filter = "brightness(0)";
          Object.assign(mediaElement.style, {
            // border: "7px solid green",
            // borderRadius: "10px",
            // marginLeft: "10px",
            height: "300px",
            width: "100%",
          });

          // Check if the track is video and muted
          if (track.kind === "video" && track.muted) {
            console.log(
              `Video track for producerId=${remoteProducerId} is muted, applying brightness filter`
            );
            mediaElement.style.filter = "brightness(0)";
          }

          mediaElement.addEventListener("loadedmetadata", () => {
            // mediaElement.style.filter = "none";
            mediaElement
              .play()
              .catch((error) =>
                console.error("Failed to start playback:", error)
              );
          });
        } else {
          console.log("Video track is not actively being shared or is muted.");
        }

        // Inform server to resume media if it started paused
        socket.emit("consumer-resume", {
          serverConsumerId: params.serverConsumerId,
        });

        // Handling video pause event
        socket.on(
          "remote-producer-media-toggle",
          ({ producerId, isMedia, mediaType }) => {
            console.log(
              "remote-producer-media-toggle ---> ",
              producerId,
              " ",
              isMedia,
              " ",
              mediaType
            );
            if (producerId === remoteProducerId) {
              const videoElement = document.getElementById(
                `${mediaType}-${remoteProducerId}`
              );
              if (videoElement) {
                if (isMedia) {
                  // Video paused
                  console.log(
                    `remote producer ${producerId + " " + mediaType} paused`
                  );
                  videoElement.style.filter = "brightness(0)";
                  // videoElement.parentElement.querySelector("p").innerText =
                  //   "Video paused";
                } else {
                  // Video resumed
                  console.log(
                    `remote producer ${producerId + " " + mediaType} resume`
                  );
                  videoElement.style.filter = "none";
                  // videoElement.parentElement.querySelector("p").innerText = "";
                }
              }
            }
          }
        );
      }
    );
  };

  useEffect(() => {
    setRoomName(roomId);
    setUsername(localStorage.getItem("username"));
    if (!localStorage.getItem("username")) {
      navigate("/");
    } else {
      if (socket) {
        socket.on("connection-success", ({ socketId }) => {
          getLocalStream();
        });

        socket.on("producer-closed", ({ remoteProducerId }) => {
          console.log(
            "producer-closed ----> remoteProducerId ",
            remoteProducerId
          );
          // server notification is received when a producer is closed
          // we need to close the client-side consumer and associated transport
          const producerToClose = consumerTransports.find(
            (transportData) => transportData.producerId === remoteProducerId
          );
          if (producerToClose) {
            producerToClose.consumerTransport.close();
            producerToClose.consumer.close();
          }

          // remove the consumer transport from the list
          consumerTransports = consumerTransports.filter(
            (transportData) => transportData.producerId !== remoteProducerId
          );

          // Find the video element by ID
          const videoElement = document.getElementById(
            `peer-${remoteProducerId}`
          );

          // Check if the element exists and is a valid DOM node before attempting to remove it
          if (videoElement && videoElement.parentNode) {
            // Remove the video element from its parent node
            videoContainer.removeChild(videoElement);
          } else {
            console.error("Video element not found or parent node is missing.");
          }
        });

        // server informs the client of a new producer just joined
        socket.on("new-producer", ({ producerId, remoteProducerUserName }) => {
          // socket.emit("video-on-off", {
          //   isCamera: !videoMuted,
          // });
          signalNewConsumerTransport(producerId, remoteProducerUserName);
        });

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
  const toggleVideo = async () => {
    await setVideoMuted(!videoMuted);
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
            <td style={{ verticalAlign: "top" }}>
              <video
                id="localScreen"
                autoPlay
                className="videoScreen"
                muted
                style={{
                  // margin: "0 2vw 0 2vw",
                  border: "7px solid black",
                  backgroundColor: "black",
                  width: "35vw",
                }}
              ></video>
            </td>
            <td
              className="localColumn flex flex-row"
              style={{
                alignItems: "flex-start",
                display: "flex",
                flexDirection: "row",
                margin: "0 2vw",
              }}
            >
              <section
                className="md:relative border flex flex-col items-center"
                style={{
                  border: "7px solid black",
                  borderRadius: "10px",
                  gridTemplateColumns: "auto auto auto auto",
                  gridGap: "10px",
                  backgroundColor: "black",
                  height: "24vw",
                }}
              >
                {/* Video Element */}
                <video
                  id="localVideo"
                  autoPlay
                  loop
                  muted
                  className="video inset-0 object-cover object-center md:absolute"
                  style={{
                    width: "100%",
                    padding: "0.75vw",
                    height: "-webkit-fill-available",
                  }}
                >
                  Your browser does not support the video tag.
                </video>

                {/* Username, Microphone, and Camera Icons */}
                <div
                  className="relative z-1 mx-auto max-w-screen-xl px-4 py-22 sm:px-6 lg:flex lg:h-screen lg:items-center lg:px-8 border border-red-500"
                  style={{
                    alignItems: "flex-end",
                    paddingBottom: "0.7vw",
                  }}
                >
                  <div className="w-full text-center text-white flex justify-between items-center">
                    {/* Username */}
                    <p
                      className="text-heading-1 font-bold text-3xl"
                      style={{ marginRight: "200px" }}
                    >
                      {username}
                    </p>

                    {/* Microphone and Camera Icons */}
                    <div className="flex items-center">
                      {/* Microphone Icon */}
                      {audioMuted ? (
                        <CiMicrophoneOff
                          style={{
                            fontSize: "25px",
                            color: "red",
                            cursor: "pointer",
                          }}
                        />
                      ) : (
                        <CiMicrophoneOn
                          style={{ fontSize: "25px", cursor: "pointer" }}
                        />
                      )}

                      {/* Camera Icon */}
                      {videoMuted ? (
                        <BsFillCameraVideoOffFill
                          style={{
                            fontSize: "25px",
                            color: "red",
                            cursor: "pointer",
                          }}
                        />
                      ) : (
                        <BsFillCameraVideoFill
                          style={{ fontSize: "25px", cursor: "pointer" }}
                        />
                      )}
                    </div>
                  </div>

                  <br />
                  {/* <p>technologies to enhance productivity.</p> */}

                  <div className="flex flex-wrap justify-center text-center"></div>
                </div>
              </section>
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
