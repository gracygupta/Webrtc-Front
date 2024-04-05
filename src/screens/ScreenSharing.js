import React, { useState, useEffect, useRef } from "react";
import { MdOutlineTvOff } from "react-icons/md";
import { FaTv } from "react-icons/fa";
import { device } from "./Mediasoup";
import io from "socket.io-client";
import { SERVER_LOCALHOST, SERVER_DEPLOYMENT } from "../helper/constants";
import { params } from "../helper/constants";
const ScreenSharing = ({ socket, roomName }) => {
  // const [socket, setSocket]= useState()
  const [screenShared, setScreenShared] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const producerTransport = useRef(null);
  // let producerTransport;
  let videoParamsScreen = { params };
  let audioParamsScreen;
  let videoProducerScreen;
  let audioProducerScreen;

  const startScreenSharing = async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      if (displayStream.getAudioTracks() && displayStream.getAudioTracks()[0])
        audioParamsScreen = {
          track: displayStream.getAudioTracks()[0],
          ...audioParamsScreen,
        };
      videoParamsScreen = {
        track: displayStream.getVideoTracks()[0],
        ...videoParamsScreen,
      };

      setScreenStream(displayStream);
      setScreenShared(true);

      // Play the screen stream in the localScreen video element
      const localScreenElement = document.getElementById("localScreen");
      if (localScreenElement && displayStream) {
        localScreenElement.srcObject = displayStream;
        localScreenElement.play();
      }
      createSendTransport();
    } catch (err) {
      setScreenShared(false);
      setScreenStream(null);
      console.error("Error starting screen sharing:", err);
    }
  };

  const stopScreenSharing = () => {
    console.log("stopScreenSharing ---> screenShared", screenShared);
    console.log("stopScreenSharing ---> screenStream", screenStream);
    console.log(
      "Producers stopScreenSharing === >",
      producerTransport.current.id
    );
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
      setScreenStream(null);
      setScreenShared(false);

      if (producerTransport.current) {
        const producerId = producerTransport.current.id;
        producerTransport.current.close();
        console.log("Producer transport closed successfully");
      }
      socket.emit("stopScreenSharing");
    }
  };

  const createSendTransport = () => {
    // Emit request to server to create WebRTC transport
    // This is called from Producer, so sender = true
    socket.emit(
      "createWebRtcTransportScreenShared",
      { consumer: false, screenProducer: true, roomName },
      ({ params }) => {
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
        producerTransport.current = device.createSendTransport(params);
        console.log("ScreenSharing ----> ", producerTransport);

        // Event raised when first call to transport.produce() is made
        producerTransport.current.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
            try {
              // Signal local DTLS parameters to the server side transport
              await socket.emit("transport-connect", {
                dtlsParameters,
                screenProducer: true,
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
        producerTransport.current.on(
          "produce",
          async (parameters, callback, errback) => {
            try {
              // Tell the server to create a Producer with the following parameters
              // and expect back a server side producer id
              await socket.emit(
                "transport-produce",
                {
                  kind: parameters.kind,
                  rtpParameters: parameters.rtpParameters,
                  appData: parameters.appData,
                  screenProducer: true,
                },
                ({ id, producersExist }) => {
                  // Log successful transport produce event
                  console.log(
                    JSON.stringify({
                      message: "Transport Produced Successfully",
                      producerParameters: parameters,
                      serverProducerId: id
                        ? `Server side producer id ${id}`
                        : null,
                      location: "createSendTransport",
                    })
                  );
                  // Tell the transport that parameters were transmitted and provide it with the
                  // server side producer's id.
                  callback({ id });
                  console.log("id:", id);
                  // If producers exist, then join room
                  //   if (producersExist) getProducers();
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
          }
        );

        // Call connectSendTransport after creating send transport
        connectSendTransport();
      }
    );
  };

  const connectSendTransport = async () => {
    // Instruct the producer transport to send media to the Router
    // This action will trigger the 'connect' and 'produce' events above
    // More info: https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce

    console.log("connectSendTransport ----> ", producerTransport);
    try {
      // Check if screensharing is enabled for a user
      if (audioParamsScreen) {
        audioProducerScreen = await producerTransport.current.produce(
          audioParamsScreen
        );
      }
      videoProducerScreen = await producerTransport.current.produce(
        videoParamsScreen
      );

      // Handle events for audioProducer
      audioProducerScreen.on("trackended", () => {
        console.log(
          JSON.stringify({
            message: "Audio track ended",
            location: "connectSendTransport",
          })
        );
        // Additional logic to handle track ending
      });

      audioProducerScreen.on("transportclose", () => {
        console.log(
          JSON.stringify({
            message: "Audio transport closed",
            location: "connectSendTransport",
          })
        );
        // Additional logic to handle transport closing
      });

      // Handle events for videoProducer
      videoProducerScreen.on("trackended", () => {
        console.log(
          JSON.stringify({
            message: "Video track ended",
            location: "connectSendTransport",
          })
        );
        // Additional logic to handle track ending
      });

      videoProducerScreen.on("transportclose", () => {
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

  // Mute/unmute video
  const toggleScreenVideo = async () => {
    console.log("!screenShared)", !screenShared);
    setScreenShared(!screenShared);
    console.log("toggle Screen Video ---->", producerTransport.current);
    // console.log(" toggleScreenVideo --- > screenShared", !screenShared);
    if (!screenShared) {
      startScreenSharing();
    } else {
      stopScreenSharing();
    }
  };

  // when user clicks on browser overlay to stop sharing
  if (screenStream) {
    screenStream.getVideoTracks()[0].onended = function () {
      console.log("stream ended ------>");
      toggleScreenVideo();
    };
  }
  // useEffect(() => {
  //   // console.log("stopScreenSharing useEffect ---> screenShared", screenShared);
  //   // console.log("stopScreenSharing useEffect ---> screenStream", screenStream);
  // }, [screenShared, screenStream]);

  return (
    <>
      <button onClick={toggleScreenVideo}>
        {screenShared ? (
          <MdOutlineTvOff
            style={{ fontSize: "70px", color: "red", cursor: "pointer" }}
          ></MdOutlineTvOff>
        ) : (
          <FaTv style={{ fontSize: "70px", cursor: "pointer" }}></FaTv>
        )}
      </button>
    </>
  );
};

export default ScreenSharing;
