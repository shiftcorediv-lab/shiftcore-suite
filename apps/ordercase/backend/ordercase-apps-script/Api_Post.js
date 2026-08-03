/****************************************************
 * Api_Post.gs
 * POST API
 ****************************************************/

function handlePost_(e) {
  try {
    const body = parsePostBody_(e);
    const action = body.action || '';
    const payload = body.payload || {};

    /****************************************************
     * createCase ここから
     ****************************************************/
    if (action === 'createCase') {
      const context = requireOrderCaseEditor_(getIdTokenFromBody_(body));

      payload.created_by = context.user.name || context.user.displayName || context.user.email || '';
      payload.created_by_email = context.user.email || '';

      const result = createCase_(payload);

      return jsonResponse_({
        ok: true,
        action: action,
        permission: context.permission,
        data: result
      });
    }
    /****************************************************
     * createCase ここまで
     ****************************************************/


    /****************************************************
     * updateCase ここから
     ****************************************************/
    if (action === 'updateCase') {
      const context = requireOrderCaseEditor_(getIdTokenFromBody_(body));

      payload.updated_by = context.user.name || context.user.displayName || context.user.email || '';
      payload.updated_by_email = context.user.email || '';

      const result = updateCase_(payload, {
        can_change_case_rank: context.canManage
      });

      return jsonResponse_({
        ok: true,
        action: action,
        permission: context.permission,
        data: result
      });
    }

    if (action === 'updateStoreMaster') {
      const context = requireOrderCaseEditor_(getIdTokenFromBody_(body));
      return jsonResponse_({ ok: true, action: action, permission: context.permission, data: updateStoreMaster_(payload) });
    }
    /****************************************************
     * updateCase ここまで
     ****************************************************/


    /****************************************************
     * 不明action ここから
     ****************************************************/
    return jsonResponse_({
      ok: false,
      code: 'UNKNOWN_ACTION',
      message: '不明なactionです。',
      received_action: action
    });
    /****************************************************
     * 不明action ここまで
     ****************************************************/

  } catch (error) {
    return jsonResponse_({
      ok: false,
      code: 'SERVER_ERROR',
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : ''
    });
  }
}
