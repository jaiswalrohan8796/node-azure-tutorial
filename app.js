const express = require("express");
const multer = require("multer");
const path = require("path");
const ejs = require("ejs");
require("dotenv").config();

const { BlobServiceClient } = require("@azure/storage-blob");
const getStream = require("into-stream");
const ONE_MEGABYTE = 1024 * 1024;
const uploadOptions = { bufferSize: 4 * ONE_MEGABYTE, maxBuffers: 20 };

// express config
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.set("view engine", "ejs");
app.set("views", "views");

//multer config
var storage = multer.memoryStorage();
var upload = multer({ storage: storage });
const streamToBuffer = require("./streamToBuffer.js");

//azure config
const AZURE_STORAGE_CONNECTION_STRING =
    process.env.AZURE_STORAGE_CONNECTION_STRING;
const blobServiceClient = BlobServiceClient.fromConnectionString(
    AZURE_STORAGE_CONNECTION_STRING
);
var myContainer;


//run only once
app.get("/create", async(req, res, next) => {
    await createMyContainer("pdfcontainer")
    res.redirect("/")
});

//get container
myContainer = blobServiceClient.getContainerClient("pdfcontainer-1618206209039");

app.post("/upload", upload.single("pdf"), async (req, res, next) => {
    const pdfFile = req.file;
    try {
        //upload
        await uploadToAzure(pdfFile.buffer, req);
    } catch (e) {
        console.log(e);
    }
    res.redirect("/");
});
app.get("/delete/:name", async (req, res, next) => {
    const name = req.params.name;
    try {
        await deleteBlob(name);
    } catch (e) {
        console.log(e);
    }
    res.redirect("/");
});
app.get("/download/:name", async (req, res, next) => {
    const name = req.params.name;
    try {
        const pdfBuffer = await downloadBlob(name);
        res.writeHead(200, {
            "Content-Type": "application/pdf",
            "Content-Disposition":
                "inline; filename = case study rohan.pdf-1618136609114.pdf",
            "Content-Length": pdfBuffer.length,
        });
        res.end(pdfBuffer);
    } catch (e) {
        console.log(e);
    }
});

app.get("/", async (req, res, next) => {
    try {
        //get all
        const allBlobsList = await getAllBlobs();
        res.render("home", { blobs: allBlobsList });
    } catch (e) {
        console.log(e);
        return res.render("home", { blobs: [] });
    }
});

app.listen(PORT, () => {
    console.log("listening on PORT 3000");
});

//CREATE Container once
const createMyContainer = async (text) => {
    const containerName = `${text}-${new Date().getTime()}`;
    myContainer = blobServiceClient.getContainerClient(containerName);
    const createContainerResponse = await myContainer.create();
    console.log(
        `Create container ${containerName} successfully`,
        createContainerResponse
    );
};

//GET all blobs
const getAllBlobs = async () => {
    let allBlobsList = [];
    for await (const blob of myContainer.listBlobsFlat()) {
        allBlobsList.push(blob);
    }
    return allBlobsList;
};

//UPLOAD blob to Azure
const uploadToAzure = async (buffer, req) => {
    const blobName = `${req.file.originalname}-${new Date().getTime()}`;
    const myBlob = myContainer.getBlockBlobClient(blobName);
    const stream = getStream(buffer);
    try {
        const uploadResponse = await myBlob.uploadStream(
            stream,
            uploadOptions.bufferSize,
            uploadOptions.maxBuffers,
            {
                blobHTTPHeaders: { blobContentType: "application/pdf" },
            }
        );
        console.log(`file uploaded...`, uploadResponse);
    } catch (e) {
        console.log(e);
        throw new Error("uploadToAzure function throwed !");
    }
};

//DELETE a blob
const deleteBlob = async (blobName) => {
    const myBlob = myContainer.getBlockBlobClient(blobName);
    try {
        const deleteResponse = await myBlob.deleteIfExists();
        console.log(`blob deleted ....`, deleteResponse);
    } catch (e) {
        console.log(e);
        throw new Error("deleteBlob function throwed !");
    }
};

//DOWNLOAD blob
const downloadBlob = async (blobName) => {
    const myBlob = myContainer.getBlockBlobClient(blobName);
    try {
        const downloadBlockBlobResponse = await myBlob.download();
        const downloaded = await streamToBuffer(
            downloadBlockBlobResponse.readableStreamBody
        );
        return downloaded;
    } catch (e) {
        console.log(e);
        throw new Error("downloadBlob function throwed !");
    }
};
