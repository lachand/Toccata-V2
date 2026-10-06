// Base `inst_<id>` : données d'une instance (état des apps, soumissions, état participant).
// Un élève n'accède qu'à SA base ; l'enseignant a le rôle inst:<id>:teacher sur toutes.
function (newDoc, oldDoc, userCtx, secObj) {
  if (userCtx.roles.indexOf('_admin') !== -1) return;
  var id = userCtx.db.replace(/^inst_/, '');
  var teacher = userCtx.roles.indexOf('inst:' + id + ':teacher') !== -1;
  var member = userCtx.roles.indexOf('inst:' + id + ':member') !== -1;
  if (!teacher && !member) throw ({ forbidden: 'Accès refusé' });
  if (teacher) return;

  var target = newDoc._deleted ? oldDoc : newDoc;
  if ((target && target.teacherOnly === true) || (oldDoc && oldDoc.teacherOnly === true)) {
    throw ({ forbidden: 'Réservé à l\'enseignant' });
  }
  if (!newDoc._deleted) {
    if (!oldDoc && newDoc.authorId !== userCtx.name) {
      throw ({ forbidden: 'authorId doit être l\'utilisateur courant' });
    }
    if (oldDoc && oldDoc.authorId !== undefined && newDoc.authorId !== oldDoc.authorId) {
      throw ({ forbidden: 'authorId est immuable' });
    }
  }
}
