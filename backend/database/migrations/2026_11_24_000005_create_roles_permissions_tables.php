<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->char('tenant_id', 26)->nullable();
            $table->string('name');
            $table->string('guard_name', 32)->default('web');
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->unique(['tenant_id', 'name', 'guard_name']);
        });

        Schema::create('permissions', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->string('name');
            $table->string('guard_name', 32)->default('web');
            $table->timestamps();

            $table->unique(['name', 'guard_name']);
        });

        Schema::create('role_permissions', function (Blueprint $table) {
            $table->char('role_id', 26);
            $table->char('permission_id', 26);

            $table->primary(['role_id', 'permission_id']);
            $table->foreign('role_id')->references('id')->on('roles')->onDelete('cascade');
            $table->foreign('permission_id')->references('id')->on('permissions')->onDelete('cascade');
        });

        Schema::create('tenant_user_roles', function (Blueprint $table) {
            $table->char('tenant_user_id', 26);
            $table->char('role_id', 26);

            $table->primary(['tenant_user_id', 'role_id']);
            $table->foreign('tenant_user_id')->references('id')->on('tenant_users')->onDelete('cascade');
            $table->foreign('role_id')->references('id')->on('roles')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_user_roles');
        Schema::dropIfExists('role_permissions');
        Schema::dropIfExists('permissions');
        Schema::dropIfExists('roles');
    }
};
