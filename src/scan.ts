#!/usr/bin/env node

import { readdirSync, statSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import { ElementType, iFileScanResult, tDetail } from "./types";

const [, , ...args] = process.argv;
const rootDirectory = args[0] || "./src";

/**
 * `styled` element regex
 * Group 1 is the component type. "." for html-element, "(" for custom-element.
 * Group 2 is the element name
 * @type {RegExp}
 */
const findStyledUsesRegex = /styled([.(]?)([\w]+)[)]?/g;

// Get an array of files to scan
function getFileList(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const dirContents = readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  dirContents.forEach((fileName) => {
    if (statSync(`${dirPath}/${fileName}`).isDirectory()) {
      arrayOfFiles = getFileList(`${dirPath}/${fileName}`, arrayOfFiles);
    } else {
      const ext = path.extname(`${dirPath}/${fileName}`);
      if (ext === ".js" || ext === ".ts" || ext === ".tsx") {
        arrayOfFiles.push(path.join(dirPath, "/", fileName));
      }
    }
  });

  return arrayOfFiles;
}

/**
 * Uses regex to scan a given file-buffer, and returns found uses of `styled`
 * with details.
 * @param fileName
 * @param buffer
 */
function scanBufferForStyledComponents(
  fileName: string,
  buffer: Buffer
): iFileScanResult {
  const content = buffer.toString();
  let htmlElementsRestyled = 0;
  let customElementsRestyled = 0;
  const specificResults: any = {};

  let match = findStyledUsesRegex.exec(content);

  while (match != null) {
    const elementType =
      match[1] === "." ? ElementType.HTML : ElementType.Custom;
    const elementName = match[2];

    // Increment general match
    if (elementType === ElementType.HTML) {
      htmlElementsRestyled += 1;
    } else {
      customElementsRestyled += 1;
    }

    // Create or increment exact dictionary
    if (Object.keys(specificResults).includes(elementName)) {
      specificResults[elementName] += 1;
    } else {
      specificResults[elementName] = 1;
    }

    // Continue...
    match = findStyledUsesRegex.exec(content);
  }

  return {
    filename: fileName,
    htmlElementCount: htmlElementsRestyled,
    customElementCount: customElementsRestyled,
    details: specificResults,
  };
}

const files = getFileList(rootDirectory);

// Scan all found files
Promise.all(
  files.map((fileName) => {
    return readFile(fileName).then((buffer) =>
      scanBufferForStyledComponents(fileName, buffer)
    );
  })
).then((fileScanResults) => {
  let totalHtmlElementCount = 0;
  let totalCustomElementCount = 0;
  const specificObjects = {};

  // Go over each result, and count up totals
  fileScanResults.forEach((scanResult) => {
    totalHtmlElementCount += scanResult.htmlElementCount;
    totalCustomElementCount += scanResult.customElementCount;

    Object.keys(scanResult.details).forEach((key) => {
      if (Object.keys(specificObjects).includes(key)) {
        specificObjects[key] += scanResult.details[key];
      } else {
        specificObjects[key] = scanResult.details[key];
      }
    });
  });

  const detailsArray: tDetail[] = Object.keys(specificObjects).map((key) => [
    key,
    specificObjects[key],
  ]);
  const sortedDetailsArray = detailsArray.sort((a, b) => {
    return b[1] - a[1];
  });

  // Output Results
  console.log(`${fileScanResults.length} files scanned`);
  console.log(`Native elements restyled: ${totalHtmlElementCount}`);
  console.log(`Custom elements restyled: ${totalCustomElementCount}`);
  console.log("Details:");
  sortedDetailsArray.forEach((detail) => {
    console.log(`  ${detail[0]}: ${detail[1]}`);
  });
});
