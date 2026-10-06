// Base `master_<id>` : contenu de l'activité (étapes, ressources, apps, config).
// Lecture : rôle master:<id>:read ou :write (via _security). Écriture : enseignant seulement.
function (newDoc, oldDoc, userCtx, secObj) {
  if (userCtx.roles.indexOf('_admin') !== -1) return;
  var id = userCtx.db.replace(/^master_/, '');
  if (userCtx.roles.indexOf('master:' + id + ':write') === -1) {
    throw ({ forbidden: 'Contenu en lecture seule' });
  }
}
