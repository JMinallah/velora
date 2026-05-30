declare module "pdf-parse" {
  export type PDFParseFunction = (data: Buffer | Uint8Array | ArrayBuffer) => Promise<{ text?: string }>

  const pdfParse: PDFParseFunction
  export default pdfParse
}
