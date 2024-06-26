// if config.includeWWW include an alias for the www subdomain
import { config, tenMinutes } from "./config";
import * as aws from "@pulumi/aws";
import { contentBucket, logsBucket, originAccessIdentity } from "./s3";
import { certificateArn } from "./acm";

const distributionAliases = config.includeWWW
  ? [config.targetDomain, `www.${config.targetDomain}`]
  : [config.targetDomain];

const distributionArgs: aws.cloudfront.DistributionArgs = {
  enabled: true,
  // Alternate aliases the CloudFront distribution can be reached at, in addition to https://xxxx.cloudfront.net.
  // Required if you want to access the distribution via config.targetDomain as well.
  aliases: distributionAliases,

  // We only specify one origin for this distribution, the S3 content bucket.
  origins: [
    {
      originId: contentBucket.arn,
      domainName: contentBucket.bucketRegionalDomainName,
      s3OriginConfig: {
        originAccessIdentity: originAccessIdentity.cloudfrontAccessIdentityPath,
      },
    },
  ],

  defaultRootObject: "index.html",

  // A CloudFront distribution can configure different cache behaviors based on the request path.
  // Here we just specify a single, default cache behavior which is just read-only requests to S3.
  defaultCacheBehavior: {
    targetOriginId: contentBucket.arn,

    viewerProtocolPolicy: "redirect-to-https",
    allowedMethods: ["GET", "HEAD", "OPTIONS"],
    cachedMethods: ["GET", "HEAD", "OPTIONS"],

    forwardedValues: {
      cookies: { forward: "none" },
      queryString: false,
    },

    minTtl: 0,
    defaultTtl: tenMinutes,
    maxTtl: tenMinutes,
  },

  // "All" is the most broad distribution, and also the most expensive.
  // "100" is the least broad, and also the least expensive.
  priceClass: "PriceClass_100",

  // You can customize error responses. When CloudFront receives an error from the origin (e.g. S3 or some other
  // web service) it can return a different error code, and return the response for a different resource.
  customErrorResponses: [
    { errorCode: 404, responseCode: 404, responsePagePath: "/404.html" },
    { errorCode: 403, responseCode: 200, responsePagePath: "/index.html" },
  ],

  restrictions: {
    geoRestriction: {
      restrictionType: "none",
    },
  },

  viewerCertificate: {
    acmCertificateArn: certificateArn, // Per AWS, ACM certificate must be in the us-east-1 region.
    sslSupportMethod: "sni-only",
  },

  loggingConfig: {
    bucket: logsBucket.bucketDomainName,
    includeCookies: false,
    prefix: `${config.targetDomain}/`,
  },
};

export const cdn = new aws.cloudfront.Distribution("cdn", distributionArgs);
