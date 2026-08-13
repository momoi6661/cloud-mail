import role from '../entity/role';
import orm from '../entity/orm';
import { eq, asc, inArray, and, sql } from 'drizzle-orm';
import BizError from '../error/biz-error';
import rolePerm from '../entity/role-perm';
import perm from '../entity/perm';
import { permConst, roleConst, isDel } from '../const/entity-const';
import userService from './user-service';
import user from '../entity/user';
import verifyUtils from '../utils/verify-utils';
import { t } from '../i18n/i18n.js';
import emailUtils from '../utils/email-utils';
import account from '../entity/account';

const roleService = {

	async add(c, params, userId) {

		let { name, permIds, banEmail, availDomain, sharedEmail = [] } = params;

		if (!name) {
			throw new BizError(t('emptyRoleName'));
		}

		let roleRow = await orm(c).select().from(role).where(eq(role.name, name)).get();

		const notEmailIndex = banEmail.findIndex(item => (!verifyUtils.isEmail(item) && !verifyUtils.isDomain(item)) && item !== "*");

		if (notEmailIndex > -1) {
			throw new BizError(t('notEmail'));
		}

		banEmail = banEmail.join(',');

		availDomain = availDomain.join(',');
		sharedEmail = await this.validateSharedEmails(c, sharedEmail, permIds);

		roleRow = await orm(c).insert(role).values({...params, banEmail, availDomain, sharedEmail, userId}).returning().get();

		if (permIds.length === 0) {
			return;
		}

		const rolePermList = permIds.map(permId => ({ permId, roleId: roleRow.roleId }));

		await orm(c).insert(rolePerm).values(rolePermList).run();


	},

	async roleList(c) {

		const roleList = await orm(c).select().from(role).orderBy(asc(role.sort)).all();
		const permList = await orm(c).select({ permId: perm.permId, roleId: rolePerm.roleId }).from(rolePerm)
			.leftJoin(perm, eq(perm.permId, rolePerm.permId))
			.where(eq(perm.type, permConst.type.BUTTON)).all();

		roleList.forEach(role => {
			role.banEmail = role.banEmail.split(",").filter(item => item !== "");
			role.availDomain = role.availDomain.split(",").filter(item => item !== "");
			role.permIds = permList.filter(perm => perm.roleId === role.roleId).map(perm => perm.permId);
			role.sharedEmail = role.sharedEmail ? role.sharedEmail.split(",").filter(item => item !== "") : [];
		});

		return roleList;
	},

	async setRole(c, params) {

		let { name, permIds, roleId, banEmail, availDomain, sharedEmail = [] } = params;

		if (!name) {
			throw new BizError(t('emptyRoleName'));
		}

		delete params.isDefault

		const notEmailIndex = banEmail.findIndex(item => (!verifyUtils.isEmail(item) && !verifyUtils.isDomain(item)) && item !== "*")

		if (notEmailIndex > -1) {
			throw new BizError(t('notEmail'));
		}

		banEmail = banEmail.join(',')

		availDomain = availDomain.join(',')
		sharedEmail = await this.validateSharedEmails(c, sharedEmail, permIds);

		await orm(c).update(role).set({...params, banEmail, availDomain, sharedEmail}).where(eq(role.roleId, roleId)).run();
		await orm(c).delete(rolePerm).where(eq(rolePerm.roleId, roleId)).run();

		if (permIds.length > 0) {
			const rolePermList = permIds.map(permId => ({ permId, roleId: roleId }));
			await orm(c).insert(rolePerm).values(rolePermList).run();
		}

	},

	async delete(c, params) {

		const { roleId } = params;

		const roleRow = await orm(c).select().from(role).where(eq(role.roleId, roleId)).get();

		if (!roleRow) {
			throw new BizError(t('notExist'));
		}

		if (roleRow.isDefault) {
			throw new BizError(t('delDefRole'));
		}

		const defRoleRow = await orm(c).select().from(role).where(eq(role.isDefault, roleConst.isDefault.OPEN)).get();

		await userService.updateAllUserType(c, defRoleRow.roleId, roleId);

		await orm(c).delete(rolePerm).where(eq(rolePerm.roleId, roleId)).run();
		await orm(c).delete(role).where(eq(role.roleId, roleId)).run();

	},

	roleSelectUse(c) {
		return orm(c).select({ name: role.name, roleId: role.roleId, isDefault: role.isDefault }).from(role).orderBy(asc(role.sort)).all();
	},

	async selectDefaultRole(c) {
		return await orm(c).select().from(role).where(eq(role.isDefault, roleConst.isDefault.OPEN)).get();
	},

	async setDefault(c, params) {
		const roleRow = await orm(c).select().from(role).where(eq(role.roleId, params.roleId)).get();
		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}
		await orm(c).update(role).set({ isDefault: 0 }).run();
		await orm(c).update(role).set({ isDefault: 1 }).where(eq(role.roleId, params.roleId)).run();
	},

	selectById(c, roleId) {
		return orm(c).select().from(role).where(eq(role.roleId, roleId)).get();
	},

	selectByIdsHasPermKey(c, types, permKey) {
		return orm(c).select({ roleId: role.roleId, sendType: role.sendType, sendCount: role.sendCount }).from(perm)
			.leftJoin(rolePerm, eq(perm.permId, rolePerm.permId))
			.leftJoin(role, eq(role.roleId, rolePerm.roleId))
			.where(and(eq(perm.permKey, permKey), inArray(role.roleId, types))).all();
	},

	selectByIdsAndSendType(c, permKey, sendType) {
		return orm(c).select({ roleId: role.roleId }).from(perm)
			.leftJoin(rolePerm, eq(perm.permId, rolePerm.permId))
			.leftJoin(role, eq(role.roleId, rolePerm.roleId))
			.where(and(eq(perm.permKey, permKey), eq(role.sendType, sendType))).all();
	},

	selectByUserId(c, userId) {
		return orm(c).select(role).from(user).leftJoin(role, eq(role.roleId, user.type)).where(eq(user.userId, userId)).get();
	},

	async hasPermKey(c, userId, permKey) {
		const row = await orm(c).select({ permId: perm.permId }).from(user)
			.leftJoin(rolePerm, eq(rolePerm.roleId, user.type))
			.leftJoin(perm, eq(perm.permId, rolePerm.permId))
			.where(and(eq(user.userId, userId), eq(perm.permKey, permKey))).get();
		return !!row;
	},

	async selectSharedAccountIds(c, userId) {
		if (!(await this.hasPermKey(c, userId, 'email:shared'))) {
			return [];
		}

		const roleRow = await this.selectByUserId(c, userId);
		const sharedEmails = roleRow?.sharedEmail ? roleRow.sharedEmail.split(',').filter(item => item !== '') : [];
		if (sharedEmails.length === 0) {
			return [];
		}

		const placeholders = sharedEmails.map(() => '?').join(',');
		const result = await c.env.db.prepare(
			`SELECT account_id FROM account WHERE is_del = 0 AND lower(email) IN (${placeholders})`
		).bind(...sharedEmails.map(item => item.toLowerCase())).all();
		return (result.results || []).map(row => row.account_id);
	},

	async validateSharedEmails(c, sharedEmails, permIds = []) {
		if (!Array.isArray(sharedEmails)) {
			sharedEmails = sharedEmails ? String(sharedEmails).split(',') : [];
		}

		const normalized = [...new Set(sharedEmails.map(item => String(item).trim().toLowerCase()).filter(Boolean))];
		const sharedPerm = await orm(c).select({ permId: perm.permId }).from(perm)
			.where(eq(perm.permKey, 'email:shared')).get();
		if (!sharedPerm || !permIds.map(Number).includes(sharedPerm.permId)) {
			if (normalized.length > 0) {
				throw new BizError(t('sharedMailPermRequired'));
			}
			return '';
		}

		for (const email of normalized) {
			if (!verifyUtils.isEmail(email)) {
				throw new BizError(t('notEmail'));
			}
			const accountRow = await c.env.db.prepare(`
				SELECT a.account_id
				FROM account a
				JOIN user u ON u.user_id = a.user_id
				WHERE a.is_del = 0 AND lower(a.email) = ? AND lower(u.email) = lower(?)
			`).bind(email, c.env.admin).first();
			if (!accountRow) {
				throw new BizError(t('sharedMailAdminOnly'));
			}
			const existingAccount = await orm(c).select({ accountId: account.accountId }).from(account)
				.where(and(sql`${account.email} COLLATE NOCASE = ${email}`, eq(account.isDel, isDel.NORMAL)))
				.get();
			if (!existingAccount) {
				throw new BizError(t('sharedMailNotExist'));
			}
		}
		return normalized.join(',');
	},

	hasAvailDomainPerm(availDomain, email) {

		availDomain = availDomain.split(',').filter(item => item !== '');

		if (availDomain.length === 0) {
			return true
		}

		const availIndex = availDomain.findIndex(item => {
			const domain = emailUtils.getDomain(email.toLowerCase());
			const availDomainItem = item.toLowerCase();
			return domain === availDomainItem
		})

		return availIndex > -1
	},

	selectByName(c, roleName) {
		return orm(c).select().from(role).where(eq(role.name, roleName)).get();
	},

	selectByUserIds(c, userIds) {

		if (!userIds || userIds.length === 0) {
			return [];
		}

		return orm(c).select({ ...role, userId: user.userId }).from(user).leftJoin(role, eq(role.roleId, user.type)).where(inArray(user.userId, userIds)).all();

	},

	isBanEmail(banEmail, fromEmail) {

		banEmail = banEmail.split(',').filter(item => item !== '');

		if (banEmail.includes('*')) {
			return true;
		}

		for (const item of banEmail) {

			if (verifyUtils.isDomain(item)) {

				const banDomain = item.toLowerCase();
				const receiveDomain = emailUtils.getDomain(fromEmail.toLowerCase());

				if (banDomain === receiveDomain) {
					return true;
				}

			} else {

				if (item.toLowerCase() === fromEmail.toLowerCase()) {

					return true;

				}

			}

		}

		return false;
	}
};

export default roleService;
