import { useEffect, useState } from "react";
import { useSession } from "../../state/store";
import { photoBlob } from "../../services/http";
import { orgPath } from "../../services/workflow";
export function Photo({ id, kind }: { id: string; kind: string }) {
  const org = useSession((s) => s.organizationId);
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    photoBlob(`${orgPath(org)}/photos/${id}/content`)
      .then((blob) => {
        if (active) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      URL.revokeObjectURL(objectUrl);
    };
  }, [id, org]);
  return (
    <figure>
      {url ? (
        <img src={url} alt={`${kind.toLowerCase()} maintenance evidence`} />
      ) : (
        <p>{failed ? "Photo unavailable" : "Loading photo…"}</p>
      )}
      <figcaption>{kind}</figcaption>
    </figure>
  );
}
