exports.SERVER_DEPLOYMENT = "http://13.127.35.65:4000";
exports.CLIENT_DEPLOYMENT = "https://videocalling.blockverse.tech";
exports.SERVER_LOCALHOST = "http://localhost:4000";
exports.CLIENT_LOCALHOST = "http://localhost:3000";
// https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerOptions
// https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
exports.params = {
  // mediasoup params
  encodings: [
    {
      rid: "r0",
      maxBitrate: 100000,
      scalabilityMode: "S1T3",
    },
    {
      rid: "r1",
      maxBitrate: 300000,
      scalabilityMode: "S1T3",
    },
    {
      rid: "r2",
      maxBitrate: 900000,
      scalabilityMode: "S1T3",
    },
  ],
  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
  codecOptions: {
    videoGoogleStartBitrate: 1000,
  },
};
