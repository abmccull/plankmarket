import Image, { type ImageProps } from "next/image";
import { isPrivateListingPhotoHref } from "@/lib/listing-photos";

/** Private photo requests must retain the viewer's cookies and bypass shared optimization. */
export function ListingImage({ alt, ...props }: ImageProps) {
  return <Image {...props} alt={alt} unoptimized={isPrivateListingPhotoHref(props.src) || props.unoptimized} />;
}
