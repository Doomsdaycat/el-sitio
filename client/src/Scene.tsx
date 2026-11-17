// Scène : l'image que le MJ montre à tous, et (pour le MJ) la bibliothèque d'images.

import { useEffect, useRef, useState, type DragEvent } from "react";
import type { Reponse } from "../../shared/messages.ts";
import {
  FORMATS_IMAGE,
  IMAGE_NOM_MAX,
  IMAGE_TAILLE_MAX,
  urlImage,
  type ImageBibliotheque,
} from "../../shared/scenes.ts";
import { jeton, socket } from "./connexion.ts";
import { useEtat } from "./etat.ts";

function mega(octets: number): string {
  return `${(octets / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

/** Grande image, avec un bouton plein écran. */
function Affichage(props: { id: string; titre: string; bandeau?: React.ReactNode }) {
  const cadre = useRef<HTMLDivElement>(null);
  const [pleinEcran, setPleinEcran] = useState(false);

  // Suit l'entrée et la sortie du plein écran (bouton, ou touche Échap).
  useEffect(() => {
    const suivre = () => setPleinEcran(document.fullscreenElement === cadre.current);
    document.addEventListener("fullscreenchange", suivre);
    return () => document.removeEventListener("fullscreenchange", suivre);
  }, []);

  return (
    <figure className="scene-affichage" ref={cadre}>
      <img src={urlImage(props.id)} alt={props.titre} />
      <figcaption>
        <span className="scene-titre">{props.titre}</span>
        {props.bandeau}
        <button
          type="button"
          className="secondaire"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void cadre.current?.requestFullscreen();
          }}
        >
          {pleinEcran ? "Quitter le plein écran" : "Plein écran"}
        </button>
      </figcaption>
    </figure>
  );
}

/** Envoie un fichier au serveur, avec la progression. */
function deposer(fichier: File, progression: (pourcent: number) => void): Promise<Reponse> {
  return new Promise((resoudre) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/images");
    xhr.setRequestHeader("X-Brumeland-Jeton", jeton ?? "");
    xhr.setRequestHeader("X-Nom-Fichier", encodeURIComponent(fichier.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progression(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        resoudre(JSON.parse(xhr.responseText) as Reponse);
      } catch {
        resoudre({ ok: false, erreur: `Envoi refusé (code ${xhr.status}).` });
      }
    };
    xhr.onerror = () => resoudre({ ok: false, erreur: "Envoi interrompu : vérifie la connexion." });
    xhr.send(fichier);
  });
}

function CarteImage(props: {
  image: ImageBibliotheque;
  montree: boolean;
  enApercu: boolean;
  surApercu: () => void;
  surErreur: (e: string | null) => void;
}) {
  const { image, montree, enApercu, surApercu, surErreur } = props;
  const [nom, setNom] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const repondre = (r: Reponse) => surErreur(r.ok ? null : r.erreur);

  function renommer() {
    if (nom !== null && nom.trim() !== "" && nom !== image.nom) {
      socket.emit("mj:renommerImage", { id: image.id, nom }, repondre);
    }
    setNom(null);
  }

  function supprimer() {
    if (!confirmer) {
      setConfirmer(true);
      window.setTimeout(() => setConfirmer(false), 4000);
      return;
    }
    socket.emit("mj:supprimerImage", { id: image.id }, repondre);
  }

  const classes = ["carte-image"];
  if (montree) classes.push("montree");
  if (enApercu) classes.push("apercu");

  return (
    <li className={classes.join(" ")}>
      <button type="button" className="vignette" onClick={surApercu} title="Aperçu (pour toi seul)">
        <img src={urlImage(image.id)} alt="" loading="lazy" />
        {montree && <span className="badge-montree">Montrée</span>}
      </button>
      <input
        className="nom-image"
        aria-label="Nom de l'image"
        maxLength={IMAGE_NOM_MAX}
        value={nom ?? image.nom}
        onFocus={() => setNom(image.nom)}
        onChange={(e) => setNom(e.target.value)}
        onBlur={renommer}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setNom(null);
            e.currentTarget.blur();
          }
        }}
      />
      <div className="carte-image-actions">
        <span className="discret petit">{mega(image.taille)}</span>
        {montree ? (
          <button
            type="button"
            className="secondaire"
            onClick={() => socket.emit("mj:montrerScene", { id: null }, repondre)}
          >
            Retirer
          </button>
        ) : (
          <button type="button" onClick={() => socket.emit("mj:montrerScene", { id: image.id }, repondre)}>
            Montrer
          </button>
        )}
        <button type="button" className={confirmer ? "danger" : "lien"} onClick={supprimer}>
          {confirmer ? "Confirmer" : "Supprimer"}
        </button>
      </div>
    </li>
  );
}

function Bibliotheque(props: { apercu: string | null; surApercu: (id: string | null) => void }) {
  const images = useEtat("images");
  const scene = useEtat("scene");
  const [envois, setEnvois] = useState<{ nom: string; pourcent: number }[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [survol, setSurvol] = useState(false);
  const choix = useRef<HTMLInputElement>(null);

  async function envoyer(fichiers: FileList | File[]) {
    setErreur(null);
    for (const fichier of Array.from(fichiers)) {
      if (fichier.size > IMAGE_TAILLE_MAX) {
        setErreur(`« ${fichier.name} » est trop lourde (${mega(fichier.size)}) : ${mega(IMAGE_TAILLE_MAX)} au plus.`);
        continue;
      }
      setEnvois((l) => [...l, { nom: fichier.name, pourcent: 0 }]);
      const r = await deposer(fichier, (pourcent) =>
        setEnvois((l) => l.map((e) => (e.nom === fichier.name ? { ...e, pourcent } : e))),
      );
      setEnvois((l) => l.filter((e) => e.nom !== fichier.name));
      if (!r.ok) setErreur(`« ${fichier.name} » : ${r.erreur}`);
    }
  }

  function surDepot(e: DragEvent) {
    e.preventDefault();
    setSurvol(false);
    if (e.dataTransfer.files.length > 0) void envoyer(e.dataTransfer.files);
  }

  return (
    <section className="bibliotheque">
      <h3>Bibliothèque d'images</h3>
      <p className="discret petit">
        Les joueurs ne voient que l'image que tu montres. Clique sur une vignette pour un aperçu
        rien que pour toi.
      </p>
      <div
        className={survol ? "zone-depot survol" : "zone-depot"}
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={surDepot}
      >
        <p>
          Dépose tes images ici, ou{" "}
          <button type="button" className="lien" onClick={() => choix.current?.click()}>
            choisis des fichiers
          </button>
        </p>
        <p className="discret petit">
          {FORMATS_IMAGE}, {mega(IMAGE_TAILLE_MAX)} au plus par image.
        </p>
        <input
          ref={choix}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void envoyer(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {envois.map((e) => (
        <div key={e.nom} className="envoi">
          <span>{e.nom}</span>
          <progress max={100} value={e.pourcent} />
          <span className="discret petit">{e.pourcent} %</span>
        </div>
      ))}
      {erreur && <p className="erreur">{erreur}</p>}
      {images && images.length > 0 && (
        <ul className="grille-images">
          {[...images].reverse().map((image) => (
            <CarteImage
              key={image.id}
              image={image}
              montree={scene?.image?.id === image.id}
              enApercu={props.apercu === image.id}
              surApercu={() => props.surApercu(props.apercu === image.id ? null : image.id)}
              surErreur={setErreur}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function Scene({ estMj }: { estMj: boolean }) {
  const scene = useEtat("scene");
  const images = useEtat("images");
  const [apercu, setApercu] = useState<string | null>(null);
  const imageApercu = apercu ? images?.find((i) => i.id === apercu) : undefined;
  const montree = scene?.image ?? null;

  return (
    <div className="scene">
      {estMj && imageApercu && imageApercu.id !== montree?.id ? (
        <Affichage
          id={imageApercu.id}
          titre={imageApercu.nom}
          bandeau={
            <>
              <span className="badge-secret">aperçu : les joueurs ne le voient pas</span>
              <button
                type="button"
                onClick={() =>
                  socket.emit("mj:montrerScene", { id: imageApercu.id }, (r: Reponse) => {
                    if (r.ok) setApercu(null);
                  })
                }
              >
                Montrer à tous
              </button>
              <button type="button" className="lien" onClick={() => setApercu(null)}>
                Fermer l'aperçu
              </button>
            </>
          }
        />
      ) : montree ? (
        <Affichage
          id={montree.id}
          titre={montree.nom}
          bandeau={
            estMj && (
              <button
                type="button"
                className="secondaire"
                onClick={() => socket.emit("mj:montrerScene", { id: null }, () => undefined)}
              >
                Retirer la scène
              </button>
            )
          }
        />
      ) : (
        <p className="discret scene-vide">
          {estMj
            ? "Aucune scène montrée. Dépose une image ci-dessous, puis clique sur « Montrer »."
            : "Le MJ n'a pas encore montré de scène."}
        </p>
      )}
      {estMj && <Bibliotheque apercu={apercu} surApercu={setApercu} />}
    </div>
  );
}
