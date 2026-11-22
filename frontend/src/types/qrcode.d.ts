// The qrcode package has no type declarations. This declares the one function the Guest page uses
// (an SVG for the shareable link), so the editor checks its use instead of reading the library.
declare module "qrcode" {
  const QRCode: {
    toString(text: string, options: { type: "svg"; margin?: number; width?: number }): Promise<string>;
  };
  export default QRCode;
}
