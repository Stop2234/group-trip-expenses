import { Router, json } from 'express';
import type { ExpenseService } from '../src/lib/service';
import type { ExpenseInput } from '../src/lib/service';

/**
 * REST API для веб-интерфейса.
 * Все операции идут через тот же ExpenseService, что и MCP-инструменты,
 * и сохраняются в том же JSON-хранилище.
 */
export function createApiRouter(service: ExpenseService): Router {
  const router = Router();
  router.use(json());

  /** Преобразует OperationResult в HTTP-ответ */
  function respond(
    res: import('express').Response,
    result: { success: true; data: unknown } | { success: false; error: { code: string; message: string } },
  ): void {
    if (result.success) {
      res.json(result.data);
    } else {
      const status =
        result.error.code === 'NOT_FOUND' || result.error.code === 'PAYER_NOT_FOUND' ||
        result.error.code === 'PARTICIPANT_NOT_FOUND'
          ? 404
          : result.error.code === 'UNSAFE_DELETE'
            ? 409
            : 400;
      res.status(status).json({ error: result.error });
    }
  }

  /** Полное состояние поездки */
  router.get('/state', async (_req, res, next) => {
    try {
      res.json(await service.getState());
    } catch (err) {
      next(err);
    }
  });

  /** Итоговая статистика: балансы, переводы, суммы */
  router.get('/summary', async (_req, res, next) => {
    try {
      res.json(await service.getSummary());
    } catch (err) {
      next(err);
    }
  });

  /** Взаиморасчёты */
  router.get('/settlements', async (_req, res, next) => {
    try {
      res.json(await service.getSettlements());
    } catch (err) {
      next(err);
    }
  });

  /** Список участников */
  router.get('/participants', async (_req, res, next) => {
    try {
      const state = await service.getState();
      res.json(state.participants);
    } catch (err) {
      next(err);
    }
  });

  /** Добавление участника: { name } */
  router.post('/participants', async (req, res, next) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name : '';
      respond(res, await service.addParticipant(name));
    } catch (err) {
      next(err);
    }
  });

  /** Удаление участника */
  router.delete('/participants/:id', async (req, res, next) => {
    try {
      respond(res, await service.removeParticipant(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  /** Список расходов */
  router.get('/expenses', async (_req, res, next) => {
    try {
      const state = await service.getState();
      res.json(state.expenses);
    } catch (err) {
      next(err);
    }
  });

  /** Добавление расхода */
  router.post('/expenses', async (req, res, next) => {
    try {
      respond(res, await service.addExpense(parseExpenseInput(req.body)));
    } catch (err) {
      next(err);
    }
  });

  /** Обновление расхода */
  router.put('/expenses/:id', async (req, res, next) => {
    try {
      respond(res, await service.updateExpense(req.params.id, parseExpenseInput(req.body)));
    } catch (err) {
      next(err);
    }
  });

  /** Удаление расхода */
  router.delete('/expenses/:id', async (req, res, next) => {
    try {
      respond(res, await service.removeExpense(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  /** Загрузка демо-данных */
  router.post('/demo', async (_req, res, next) => {
    try {
      res.json(await service.loadDemo());
    } catch (err) {
      next(err);
    }
  });

  /** Очистка поездки */
  router.delete('/trip', async (_req, res, next) => {
    try {
      res.json(await service.clearAll());
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/** Приводит тело HTTP-запроса к ExpenseInput */
function parseExpenseInput(body: unknown): ExpenseInput {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    title: typeof b.title === 'string' ? b.title : '',
    amountRubles: typeof b.amountRubles === 'number' ? b.amountRubles : Number.NaN,
    paidBy: typeof b.paidBy === 'string' ? b.paidBy : '',
    participants: Array.isArray(b.participants) ? (b.participants as string[]) : [],
    splitMode: b.splitMode === 'custom' ? 'custom' : 'equal',
    customSharesRubles:
      b.customSharesRubles && typeof b.customSharesRubles === 'object'
        ? (b.customSharesRubles as Record<string, number>)
        : undefined,
  };
}
