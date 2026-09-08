export async function sendWithBusyRetry(send, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await send();
    // このコードは書込み開始前のロック取得失敗だけ。通信失敗は再送しない。
    if (result?.code !== "SHIFT_WRITE_BUSY" || attempt === 3) return result;
    await wait(1500 * (attempt + 1));
  }
}

export async function runRecoverableMutation(action, body, send, wait) {
  try {
    return await sendWithBusyRetry(() => send(action, body), wait);
  } catch (error) {
    if (action === "shiftBuilderCreateAssignment") {
      try {
        const check = await sendWithBusyRetry(() => send("shiftBuilderCheckAssignment", body), wait);
        const assignment = check?.data?.assignment || check?.assignment;
        if (check?.success === true && assignment?.assignment_id) {
          return { success: true, data: { assignment }, recovered: true };
        }
      } catch (_) {
        // 照合も失敗した場合に「未保存」と断定しない。
      }
    }
    const uncertain = new Error("保存結果を確認できませんでした。保存済みの可能性があるため、再配置せず「再読み込み」で確認してください。");
    uncertain.code = "MUTATION_RESULT_UNKNOWN";
    throw uncertain;
  }
}
